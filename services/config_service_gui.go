//go:build !cli

package services

import (
	"os"
	"os/exec"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// configServiceApp holds the application reference for GUI-only operations
var configServiceApp *application.App

// SetApp sets the application reference for dialog support
func (s *ConfigService) SetApp(app *application.App) {
	configServiceApp = app
}

// SelectVaultFolder opens a folder selection dialog and sets the vault path
func (s *ConfigService) SelectVaultFolder() (string, error) {
	if configServiceApp == nil {
		return "", nil
	}

	// Open folder selection dialog
	path, err := configServiceApp.Dialog.OpenFile().
		SetTitle("Select Vault Folder").
		SetMessage("Choose the folder containing your notes").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		PromptForSingleSelection()

	if err != nil {
		return "", err
	}

	// If user selected a folder, save it
	if path != "" {
		if err := s.SetVaultPath(path); err != nil {
			return "", err
		}
	}

	return path, nil
}

// OpenConfigFile opens the config file in the default editor
func (s *ConfigService) OpenConfigFile() error {
	// Ensure config file exists
	if _, err := os.Stat(s.configPath); os.IsNotExist(err) {
		if err := s.Save(); err != nil {
			return err
		}
	}
	// Open with default application (macOS)
	return exec.Command("open", s.configPath).Start()
}
