package services

import (
	"os"
	"os/exec"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
)

// ConfigService handles application configuration
type ConfigService struct {
	configPath string
	config     *models.Config
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

// GetThinoSection returns the Thino section header
func (s *ConfigService) GetThinoSection() string {
	return s.config.Thino.Section
}

// GetThinoTimeFormat returns the Thino time format
func (s *ConfigService) GetThinoTimeFormat() string {
	return s.config.Thino.TimeFormat
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
