//go:build cli

package main

import (
	"fmt"

	"github.com/kazuph/obails/services"
)

var (
	configService *services.ConfigService
	fileService   *services.FileService
	noteService   *services.NoteService
	linkService   *services.LinkService
	graphService  *services.GraphService
	taskService   *services.TaskService
	stateService  *services.StateService
)

// initServices initializes the core services needed for most commands.
// It loads configuration, applies --vault override if specified,
// and creates FileService, NoteService, LinkService, and GraphService.
func initServices() error {
	configService = services.NewConfigService()
	if err := configService.Load(); err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	// Override vault path if --vault flag is specified
	if vaultPath != "" {
		if err := configService.SetVaultPath(vaultPath); err != nil {
			return fmt.Errorf("failed to set vault path: %w", err)
		}
	}

	// Verify vault is configured
	if configService.GetVaultPath() == "" {
		return fmt.Errorf("vault path is not configured. Use --vault flag or set it in config (%s)", configService.GetConfigPath())
	}

	fileService = services.NewFileService(configService)
	noteService = services.NewNoteService(fileService, configService)
	linkService = services.NewLinkService(fileService, configService)
	graphService = services.NewGraphService(linkService, fileService, configService)
	taskService = services.NewTaskService(fileService, noteService, configService)

	stateService = services.NewStateService(configService)
	if err := stateService.Load(); err != nil {
		// Non-fatal: state is optional
		stateService = services.NewStateService(configService)
	}

	return nil
}

// updateLastOpenedFile updates the vault state so the app opens this file on next launch.
func updateLastOpenedFile(relativePath string) {
	if stateService != nil {
		_ = stateService.SetLastOpenedFile(relativePath, "markdown")
	}
}

// initServicesWithIndex initializes all services and rebuilds the link index.
// This is required for commands that need backlink/graph data
// (e.g., backlinks, links, orphans, deadends, unresolved).
func initServicesWithIndex() error {
	if err := initServices(); err != nil {
		return err
	}

	if err := linkService.RebuildIndex(); err != nil {
		return fmt.Errorf("failed to build link index: %w", err)
	}

	return nil
}
