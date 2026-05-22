package main

import (
	"embed"
	_ "embed"
	"log"
	"net/http"

	"github.com/kazuph/obails/services"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

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

	// Create the main window
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Obails",
		Width:  1200,
		Height: 800,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	// Set window reference for window service
	windowService.SetWindow(mainWindow)

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
