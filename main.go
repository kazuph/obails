package main

import (
	"embed"
	_ "embed"
	"log"

	"github.com/kazuph/obails/services"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Initialize services
	configService := services.NewConfigService()
	if err := configService.Load(); err != nil {
		log.Printf("Warning: Failed to load config: %v", err)
	}

	fileService := services.NewFileService(configService)
	noteService := services.NewNoteService(fileService, configService)
	linkService := services.NewLinkService(fileService, configService)
	graphService := services.NewGraphService(linkService, fileService, configService)
	windowService := services.NewWindowService()

	// Build link index on startup
	go func() {
		if err := linkService.RebuildIndex(); err != nil {
			log.Printf("Warning: Failed to build link index: %v", err)
		}
	}()

	// Create the application
	app := application.New(application.Options{
		Name:        "Obails",
		Description: "A lightweight Obsidian alternative",
		Services: []application.Service{
			application.NewService(configService),
			application.NewService(fileService),
			application.NewService(noteService),
			application.NewService(linkService),
			application.NewService(graphService),
			application.NewService(windowService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
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

	// Run the application
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
