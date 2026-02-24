package services

import (
	"os"
	"path/filepath"
	"strings"

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

	configFile := "config.toml"
	if customConfigPath := strings.TrimSpace(os.Getenv("OBAILS_CONFIG_FILE")); customConfigPath != "" {
		configFile = customConfigPath
	} else if isConfigForDevelopmentEnabled() {
		configFile = "config.dev.toml"
	}

	configPath := configFile
	if !filepath.IsAbs(configPath) {
		configPath = filepath.Join(configDir, configPath)
	}

	return &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
}

func isConfigForDevelopmentEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("OBAILS_USE_DEV_CONFIG"))) {
	case "1", "true", "t", "yes", "y", "on":
		return true
	default:
		return false
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

// SetVaultPath sets the vault path and saves to config file (permanent change).
func (s *ConfigService) SetVaultPath(path string) error {
	s.config.Vault.Path = path
	return s.Save()
}

// OverrideVaultPath overrides the vault path in memory only (does NOT save to config file).
// Use this for temporary overrides like the --vault CLI flag.
func (s *ConfigService) OverrideVaultPath(path string) {
	s.config.Vault.Path = path
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

// ReloadConfig reloads the configuration from file
func (s *ConfigService) ReloadConfig() error {
	return s.Load()
}
