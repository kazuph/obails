package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
)

// ConfigService handles application configuration
type ConfigService struct {
	configPath       string
	sharedConfigPath string
	configDir        string
	useDevConfig     bool
	useCustomConfig  bool
	config           *models.Config
}

// NewConfigService creates a new ConfigService
func NewConfigService() *ConfigService {
	homeDir, _ := os.UserHomeDir()
	configDir := filepath.Join(homeDir, ".config", "obails")
	sharedConfigPath := filepath.Join(configDir, "config.toml")

	configFile := "config.toml"
	useDevConfig := false
	useCustomConfig := false
	if customConfigPath := strings.TrimSpace(os.Getenv("OBAILS_CONFIG_FILE")); customConfigPath != "" {
		configFile = customConfigPath
		useCustomConfig = true
	} else if isConfigForDevelopmentEnabled() {
		configFile = "config.dev.toml"
		useDevConfig = true
	}

	configPath := configFile
	if !filepath.IsAbs(configPath) {
		configPath = filepath.Join(configDir, configPath)
	}

	return &ConfigService{
		configPath:       configPath,
		sharedConfigPath: sharedConfigPath,
		configDir:        configDir,
		useDevConfig:     useDevConfig,
		useCustomConfig:  useCustomConfig,
		config:           models.DefaultConfig(),
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
	s.normalizePaths()

	if err := os.MkdirAll(filepath.Dir(s.configPath), 0755); err != nil {
		return err
	}

	if s.useCustomConfig {
		if _, err := os.Stat(s.configPath); os.IsNotExist(err) {
			s.config = models.DefaultConfig()
			return s.Save()
		}

		cfg := models.DefaultConfig()
		if _, err := toml.DecodeFile(s.configPath, cfg); err != nil {
			return err
		}

		s.config = cfg
		return nil
	}

	if err := os.MkdirAll(s.configDir, 0755); err != nil {
		return err
	}

	cfg := models.DefaultConfig()
	sharedExists := false
	if _, err := os.Stat(s.sharedConfigPath); err == nil {
		if _, err := toml.DecodeFile(s.sharedConfigPath, cfg); err != nil {
			return err
		}
		sharedExists = true
	} else if !os.IsNotExist(err) {
		return err
	}

	activeExists := false
	if s.useDevConfig {
		if _, err := os.Stat(s.configPath); err == nil {
			if _, err := toml.DecodeFile(s.configPath, cfg); err != nil {
				return err
			}
			activeExists = true
		} else if !os.IsNotExist(err) {
			return err
		}
	}

	if !sharedExists {
		if activeExists {
			if err := writeConfigFile(s.sharedConfigPath, cfg); err != nil {
				return err
			}
		} else {
			if err := writeConfigFile(s.sharedConfigPath, models.DefaultConfig()); err != nil {
				return err
			}
		}
	}

	s.config = cfg
	return nil
}

// Save writes configuration to file
func (s *ConfigService) Save() error {
	s.normalizePaths()

	if err := os.MkdirAll(filepath.Dir(s.configPath), 0755); err != nil {
		return err
	}

	return writeConfigFile(s.configPath, s.config)
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
	return s.saveWithSharedMutation(func(cfg *models.Config) {
		cfg.Vault.Path = path
	})
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

// SetTheme sets the UI theme and saves to config file.
func (s *ConfigService) SetTheme(theme string) error {
	s.config.UI.Theme = theme
	return s.saveWithSharedMutation(func(cfg *models.Config) {
		cfg.UI.Theme = theme
	})
}

// GetConfigPath returns the configuration file path
func (s *ConfigService) GetConfigPath() string {
	return s.configPath
}

// ReloadConfig reloads the configuration from file
func (s *ConfigService) ReloadConfig() error {
	return s.Load()
}

func (s *ConfigService) saveWithSharedMutation(applyToShared func(*models.Config)) error {
	if err := s.Save(); err != nil {
		return err
	}

	if s.useCustomConfig {
		return nil
	}

	for _, configPath := range s.sharedMutationTargets() {
		peerConfig := models.DefaultConfig()
		if _, err := os.Stat(configPath); err == nil {
			if _, err := toml.DecodeFile(configPath, peerConfig); err != nil {
				return err
			}
		} else if !os.IsNotExist(err) {
			return err
		}

		applyToShared(peerConfig)
		if err := writeConfigFile(configPath, peerConfig); err != nil {
			return err
		}
	}

	return nil
}

func (s *ConfigService) sharedMutationTargets() []string {
	devConfigPath := filepath.Join(s.configDir, "config.dev.toml")
	targets := []string{}
	for _, configPath := range []string{s.sharedConfigPath, devConfigPath} {
		if configPath == "" || configPath == s.configPath {
			continue
		}
		targets = append(targets, configPath)
	}
	return targets
}

func (s *ConfigService) normalizePaths() {
	if s.configPath == "" {
		return
	}
	if s.configDir == "" {
		s.configDir = filepath.Dir(s.configPath)
	}
	if s.sharedConfigPath == "" {
		if s.useCustomConfig || !s.useDevConfig {
			s.sharedConfigPath = s.configPath
		} else {
			s.sharedConfigPath = filepath.Join(s.configDir, "config.toml")
		}
	}
}

func writeConfigFile(path string, cfg *models.Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	tempFile, err := os.CreateTemp(filepath.Dir(path), "obails-config-*.toml")
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()
	success := false
	defer func() {
		if !success {
			_ = os.Remove(tempPath)
		}
	}()

	if err := toml.NewEncoder(tempFile).Encode(cfg); err != nil {
		_ = tempFile.Close()
		return err
	}

	if err := tempFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("rename config file: %w", err)
	}

	success = true
	return nil
}
