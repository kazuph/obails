package main

import (
	"embed"
	_ "embed"
	"log"
	"net/http"
	"strings"

	"github.com/kazuph/obails/services"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

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

func buildApplicationMenu(app *application.App, selectedTheme string) *application.Menu {
	menu := application.NewMenu()
	menu.AddRole(application.AppMenu)
	menu.AddRole(application.FileMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.ViewMenu)
	menu.AddRole(application.WindowMenu)
	themeMenu := menu.AddSubmenu("Theme")
	menu.AddRole(application.HelpMenu)
	selectedTheme = normalizeThemeValue(selectedTheme)

	for _, option := range themeMenuOptions {
		theme := option.Value
		themeMenu.AddRadio(option.Label, theme == selectedTheme).OnClick(func(ctx *application.Context) {
			app.Event.Emit("obails:theme-selected", theme)
		})
	}

	return menu
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
	noteService := services.NewNoteService(fileService, configService)
	linkService := services.NewLinkService(fileService, configService)
	graphService := services.NewGraphService(linkService, fileService, configService)
	windowService := services.NewWindowService()
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
		Name:        "Obails",
		Description: "A lightweight Obsidian alternative",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(configService),
			application.NewService(stateService),
			application.NewService(fileService),
			application.NewService(noteService),
			application.NewService(linkService),
			application.NewService(graphService),
			application.NewService(vaultWatchService),
			application.NewService(windowService),
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
	app.Menu.SetApplicationMenu(buildApplicationMenu(app, configService.GetConfig().UI.Theme))

	// Create the main window
	backdrop, liquidGlass := macBackdropForTheme(configService.GetConfig().UI.Theme)
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Obails",
		Width:          1200,
		Height:         800,
		EnableFileDrop: true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                backdrop,
			LiquidGlass:             liquidGlass,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	// Set window reference for window service
	windowService.SetWindow(mainWindow)

	mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		details := event.Context().DropTargetDetails()
		targetFolder := ""
		if details != nil {
			if path, ok := details.Attributes["data-path"]; ok {
				targetFolder = path
			}
		}
		app.Event.Emit("obails:files-dropped", map[string]any{
			"files":        event.Context().DroppedFiles(),
			"targetFolder": targetFolder,
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
