package services

import (
	"os"
	"os/exec"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// ConfigService handles application configuration
type ConfigService struct {
	configPath string
	config     *models.Config
	app        *application.App
}

// NewConfigService creates a new ConfigService
func NewConfigService() *ConfigService {
	homeDir, _ := os.UserHomeDir()
	configDir := filepath.Join(homeDir, ".config", "obails")
	configPath := filepath.Join(configDir, "config.toml")

	return &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
}

// Load reads configuration from file
func (s *ConfigService) Load() error {
	// Ensure config directory exists
	configDir := filepath.Dir(s.configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// Check if config file exists
	if _, err := os.Stat(s.configPath); os.IsNotExist(err) {
		// Create default config file
		return s.Save()
	}

	// Read config file
	if _, err := toml.DecodeFile(s.configPath, s.config); err != nil {
		return err
	}

	return nil
}

// Save writes configuration to file
func (s *ConfigService) Save() error {
	configDir := filepath.Dir(s.configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	f, err := os.Create(s.configPath)
	if err != nil {
		return err
	}
	defer f.Close()

	encoder := toml.NewEncoder(f)
	return encoder.Encode(s.config)
}

// GetConfig returns the current configuration
func (s *ConfigService) GetConfig() *models.Config {
	return s.config
}

// GetVaultPath returns the vault path
func (s *ConfigService) GetVaultPath() string {
	return s.config.Vault.Path
}

// SetVaultPath sets the vault path and saves
func (s *ConfigService) SetVaultPath(path string) error {
	s.config.Vault.Path = path
	return s.Save()
}

// GetDailyNotesFolder returns the daily notes folder relative path
func (s *ConfigService) GetDailyNotesFolder() string {
	return s.config.DailyNotes.Folder
}

// GetDailyNotesFormat returns the daily notes date format
func (s *ConfigService) GetDailyNotesFormat() string {
	return s.config.DailyNotes.Format
}

// GetTimelineSection returns the Timeline section header
func (s *ConfigService) GetTimelineSection() string {
	return s.config.Timeline.Section
}

// GetTimelineTimeFormat returns the Timeline time format
func (s *ConfigService) GetTimelineTimeFormat() string {
	return s.config.Timeline.TimeFormat
}

// GetTemplatesFolder returns the templates folder relative path
func (s *ConfigService) GetTemplatesFolder() string {
	return s.config.Templates.Folder
}

// GetConfigPath returns the configuration file path
func (s *ConfigService) GetConfigPath() string {
	return s.configPath
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

// ReloadConfig reloads the configuration from file
func (s *ConfigService) ReloadConfig() error {
	return s.Load()
}

// SetApp sets the application reference for dialog support
func (s *ConfigService) SetApp(app *application.App) {
	s.app = app
}

// SelectVaultFolder opens a folder selection dialog and sets the vault path
func (s *ConfigService) SelectVaultFolder() (string, error) {
	if s.app == nil {
		return "", nil
	}

	// Open folder selection dialog
	path, err := s.app.Dialog.OpenFile().
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
