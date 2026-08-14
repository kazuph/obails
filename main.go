package main

import (
	"embed"
	"log"
	"net/http"
	"strings"

	"github.com/kazuph/obails/services"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

const applicationVersion = "1.0.2"

// applicationMenuMainThreadFixMarker stays reachable so production binaries
// contain a strings-searchable proof of the v1.0.1 setMainMenu thread fix.
var applicationMenuMainThreadFixMarker = "obails-v1.0.1-setApplicationMenu-main-thread"

var applicationMenuRuntimeDispatcher = application.InvokeSync

func armApplicationMenuMainThreadDispatch() {
	if applicationMenuMainThreadFixMarker == "" {
		panic("missing SetApplicationMenu main-thread fix marker")
	}
	services.SetApplicationMenuDispatcher(applicationMenuRuntimeDispatcher)
}

type themeMenuOption struct {
	Group string
	Label string
	Value string
}

var themeMenuOptions = []themeMenuOption{
	{Group: "Light", Label: "GitHub Light", Value: "github-light"},
	{Group: "Light", Label: "Solarized Light", Value: "solarized-light"},
	{Group: "Light", Label: "One Light", Value: "one-light"},
	{Group: "Light", Label: "Catppuccin Latte", Value: "catppuccin-latte"},
	{Group: "Light", Label: "Rose Pine Dawn", Value: "rosepine-dawn"},
	{Group: "Dark", Label: "Catppuccin Mocha", Value: "catppuccin"},
	{Group: "Dark", Label: "Dracula", Value: "dracula"},
	{Group: "Dark", Label: "Nord", Value: "nord"},
	{Group: "Dark", Label: "Solarized Dark", Value: "solarized"},
	{Group: "Dark", Label: "One Dark", Value: "onedark"},
	{Group: "Dark", Label: "Gruvbox", Value: "gruvbox"},
	{Group: "Dark", Label: "Tokyo Night", Value: "tokyonight"},
	{Group: "Glass", Label: "Liquid Glass Light", Value: "liquid-glass-light"},
	{Group: "Glass", Label: "Liquid Glass Dark", Value: "liquid-glass-dark"},
}

func normalizeThemeValue(theme string) string {
	normalized := strings.ToLower(strings.TrimSpace(theme))
	normalized = strings.ReplaceAll(normalized, " ", "-")

	switch normalized {
	case "dark", "github-dark", "catppuccin-mocha":
		return "catppuccin"
	case "light", "github-light":
		return "github-light"
	case "solarized-dark", "solarized":
		return "solarized"
	case "one-dark", "onedark":
		return "onedark"
	case "rose-pine-dawn", "rosepine-dawn":
		return "rosepine-dawn"
	case "tokyo-night", "tokyonight":
		return "tokyonight"
	case "liquid-glass", "liquidglass", "glass", "glass-dark", "liquid-glass-dark":
		return "liquid-glass-dark"
	case "glass-light", "liquid-glass-light":
		return "liquid-glass-light"
	default:
		return normalized
	}
}

// macBackdropForTheme decides the window backdrop at startup.
// Liquid Glass themes use the native NSGlassEffectView (with automatic
// fallback to NSVisualEffectView on older macOS); everything else keeps
// the existing translucent backdrop.
func macBackdropForTheme(theme string) (application.MacBackdrop, application.MacLiquidGlass) {
	normalized := normalizeThemeValue(theme)
	if !strings.HasPrefix(normalized, "liquid-glass") {
		return application.MacBackdropTranslucent, application.MacLiquidGlass{}
	}

	style := application.LiquidGlassStyleDark
	if strings.HasSuffix(normalized, "light") {
		style = application.LiquidGlassStyleLight
	}
	return application.MacBackdropLiquidGlass, application.MacLiquidGlass{Style: style}
}

func windowVisualsForTheme(theme string) services.WindowVisuals {
	normalized := normalizeThemeValue(theme)
	backdrop, liquidGlass := macBackdropForTheme(normalized)
	appearance := application.NSAppearanceNameDarkAqua
	background := application.NewRGB(27, 38, 54)
	for _, option := range themeMenuOptions {
		if option.Value == normalized && (option.Group == "Light" || normalized == "liquid-glass-light") {
			appearance = application.NSAppearanceNameAqua
			background = application.NewRGB(255, 255, 255)
			break
		}
	}
	return services.WindowVisuals{
		Title: applicationName,
		Mac: application.MacWindow{
			Appearance:  appearance,
			Backdrop:    backdrop,
			LiquidGlass: liquidGlass,
		},
		BackgroundColour: background,
	}
}

func buildApplicationMenu(app *application.App, selectedTheme string, savedWorkspaceNames []string, activeNamedWorkspace string, onThemeSelected func(string)) *application.Menu {
	menu := application.NewMenu()
	menu.AddRole(application.AppMenu)
	// Custom File menu: stock FileMenu binds Cmd+O to native Open and steals Quick Switcher.
	fileMenu := menu.AddSubmenu("File")
	fileMenu.Add("Quick Switcher").SetAccelerator("CmdOrCtrl+O").OnClick(func(*application.Context) {
		emitApplicationEvent(app, "obails:quick-switcher", true)
	})
	fileMenu.Add("New Note").SetAccelerator("CmdOrCtrl+N").OnClick(func(*application.Context) {
		emitApplicationEvent(app, "obails:new-note", true)
	})
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.ViewMenu)
	appendWorkspaceMenu(menu, app, savedWorkspaceNames, activeNamedWorkspace)
	menu.AddRole(application.WindowMenu)
	themeMenu := menu.AddSubmenu("Theme")
	menu.AddRole(application.HelpMenu)
	selectedTheme = normalizeThemeValue(selectedTheme)

	for _, option := range themeMenuOptions {
		theme := option.Value
		themeMenu.AddRadio(option.Label, theme == selectedTheme).OnClick(func(ctx *application.Context) {
			if onThemeSelected != nil {
				onThemeSelected(theme)
			}
			emitApplicationEvent(app, "obails:theme-selected", theme)
		})
	}

	return menu
}

func appendWorkspaceMenu(menu *application.Menu, app *application.App, savedWorkspaceNames []string, activeNamedWorkspace string) {
	workspaceMenu := menu.AddSubmenu("Workspace")
	workspaceMenu.Add("Save Current Workspace As…").OnClick(func(*application.Context) {
		emitApplicationEvent(app, "obails:workspace-save-as", true)
	})
	saveCurrent := workspaceMenu.Add("Save Current Workspace")
	saveCurrent.SetEnabled(namedWorkspaceSelected(savedWorkspaceNames, activeNamedWorkspace))
	saveCurrent.OnClick(func(*application.Context) {
		emitApplicationEvent(app, "obails:workspace-save-current", true)
	})
	workspaceMenu.AddSeparator()
	openMenu := workspaceMenu.AddSubmenu("Open Workspace")
	if len(savedWorkspaceNames) == 0 {
		openMenu.Add("No saved workspaces").SetEnabled(false)
	} else {
		for _, savedName := range savedWorkspaceNames {
			name := savedName
			openMenu.AddRadio(name, name == activeNamedWorkspace).OnClick(func(*application.Context) {
				emitApplicationEvent(app, "obails:workspace-open", name)
			})
		}
	}
	workspaceMenu.AddSeparator()
	workspaceMenu.Add("Manage Workspaces…").OnClick(func(*application.Context) {
		emitApplicationEvent(app, "obails:workspace-manage", true)
	})
}

func namedWorkspaceSelected(savedNames []string, activeName string) bool {
	if activeName == "" {
		return false
	}
	for _, name := range savedNames {
		if name == activeName {
			return true
		}
	}
	return false
}

func emitApplicationEvent(app *application.App, name string, data any) {
	if app == nil {
		return
	}
	app.Event.Emit(name, data)
}

func main() {
	// Initialize services
	configService := services.NewConfigService()
	if err := configService.Load(); err != nil {
		log.Printf("Warning: Failed to load config: %v", err)
	}

	stateService := services.NewStateService(configService)
	if err := stateService.Load(); err != nil {
		log.Printf("Warning: Failed to load state: %v", err)
	}

	fileService := services.NewFileService(configService)
	searchService := services.NewSearchService(configService)
	noteService := services.NewNoteService(fileService, configService)
	linkService := services.NewLinkService(fileService, configService)
	transclusionService := services.NewTransclusionService(linkService)
	graphService := services.NewGraphService(linkService, fileService, configService)
	vaultWatchService := services.NewVaultWatchService(configService)
	transcribeService := services.NewTranscribeService(configService, fileService)

	// Build link index on startup
	go func() {
		if err := linkService.RebuildIndex(); err != nil {
			log.Printf("Warning: Failed to build link index: %v", err)
		}
	}()

	if err := vaultWatchService.Start(); err != nil {
		log.Printf("Warning: Failed to start vault watcher: %v", err)
	}

	// Create the application
	app := application.New(application.Options{
		Name:        applicationName,
		Description: "A lightweight Obsidian alternative " + applicationVersion,
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(configService),
			application.NewService(stateService),
			application.NewService(fileService),
			application.NewService(searchService),
			application.NewService(noteService),
			application.NewService(linkService),
			application.NewService(transclusionService),
			application.NewService(graphService),
			application.NewService(vaultWatchService),
			application.NewService(transcribeService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if fileService.ServeMedia(w, r) {
						return
					}
					next.ServeHTTP(w, r)
				})
			},
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})
	selectedTheme := configService.GetConfig().UI.Theme
	windowVisuals := windowVisualsForTheme(selectedTheme)
	windowService := services.NewWindowService(app, stateService, windowVisuals)
	app.RegisterService(application.NewService(windowService))
	app.OnShutdown(windowService.BeginShutdown)
	services.SetApplicationMenuApplier(selectedTheme, func(theme string, names []string, active string) {
		app.Menu.SetApplicationMenu(buildApplicationMenu(app, theme, names, active, windowService.SetMenuTheme))
	})
	// Before App.Run the platform impl is nil, so SetApplicationMenu only stores
	// the menu for Wails to apply on the AppKit main thread during Run.
	windowService.RefreshWorkspaceMenu()
	armApplicationMenuMainThreadDispatch()

	// Create the main window
	mainMacWindow := windowVisuals.Mac
	mainMacWindow.InvisibleTitleBarHeight = 50
	mainMacWindow.TitleBar = application.MacTitleBarHiddenInset
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            applicationName,
		Width:            1200,
		Height:           800,
		EnableFileDrop:   true,
		Mac:              mainMacWindow,
		BackgroundColour: windowVisuals.BackgroundColour,
		URL:              "/",
	})

	// Set window reference for window service
	windowService.SetWindow(mainWindow)
	setupGraphMagnifyMonitor(mainWindow)
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		// Wails otherwise waits for WebViewDidFinishNavigation before showing the
		// first window; a failed navigation must not leave a windowless app process.
		mainWindow.Show().Focus()
	})

	mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		details := event.Context().DropTargetDetails()
		targetFolder := ""
		targetKind := ""
		notePath := ""
		if details != nil {
			switch details.Attributes["data-drop-kind"] {
			case "markdown-editor":
				targetKind = "markdown-editor"
				notePath = details.Attributes["data-note-path"]
			default:
				targetFolder = details.Attributes["data-path"]
			}
		}
		app.Event.Emit("obails:files-dropped", map[string]any{
			"files":        event.Context().DroppedFiles(),
			"targetFolder": targetFolder,
			"targetKind":   targetKind,
			"notePath":     notePath,
		})
	})

	// Set app reference for config service (for dialogs)
	configService.SetApp(app)

	app.OnShutdown(func() {
		if err := vaultWatchService.Stop(); err != nil {
			log.Printf("Warning: Failed to stop vault watcher: %v", err)
		}
	})

	// Run the application
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
