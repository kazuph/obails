package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
)

func writeTestConfig(t *testing.T, path string, cfg *models.Config) {
	t.Helper()

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("Failed to create config file: %v", err)
	}
	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		t.Fatalf("Failed to write config: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("Failed to close config file: %v", err)
	}
}

func writeTestConfigFile(t *testing.T, path string, cfg *models.Config) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("Failed to create config dir: %v", err)
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("Failed to create config file: %v", err)
	}
	defer f.Close()

	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}
}

func readTestConfigFile(t *testing.T, path string) *models.Config {
	t.Helper()

	cfg := models.DefaultConfig()
	if _, err := toml.DecodeFile(path, cfg); err != nil {
		t.Fatalf("Failed to read config file %s: %v", path, err)
	}
	return cfg
}

func TestConfigService_OverrideVaultPath_DoesNotPersist(t *testing.T) {
	// Setup: create a temp dir with a real config.toml
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.toml")
	originalVault := "/original/vault/path"

	// Write initial config file
	cfg := models.DefaultConfig()
	cfg.Vault.Path = originalVault
	writeTestConfig(t, configPath, cfg)

	// Create ConfigService pointing to this config
	cs := &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Verify initial state
	if cs.GetVaultPath() != originalVault {
		t.Fatalf("Expected vault path %q, got %q", originalVault, cs.GetVaultPath())
	}

	// Act: override vault path (simulating --vault flag)
	overridePath := "/tmp/override/vault"
	cs.OverrideVaultPath(overridePath)

	// Assert: in-memory value is changed
	if cs.GetVaultPath() != overridePath {
		t.Errorf("In-memory vault path should be %q, got %q", overridePath, cs.GetVaultPath())
	}

	// Assert: config file still has the original value
	var savedCfg models.Config
	if _, err := toml.DecodeFile(configPath, &savedCfg); err != nil {
		t.Fatalf("Failed to read config file: %v", err)
	}
	if savedCfg.Vault.Path != originalVault {
		t.Errorf("Config file vault path should still be %q, got %q", originalVault, savedCfg.Vault.Path)
	}
}

func TestConfigService_SetVaultPath_DoesPersist(t *testing.T) {
	// Setup: create a temp dir with a real config.toml
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.toml")
	originalVault := "/original/vault/path"

	// Write initial config file
	cfg := models.DefaultConfig()
	cfg.Vault.Path = originalVault
	writeTestConfig(t, configPath, cfg)

	// Create ConfigService pointing to this config
	cs := &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Act: set vault path permanently
	newPath := "/new/permanent/vault"
	if err := cs.SetVaultPath(newPath); err != nil {
		t.Fatalf("SetVaultPath failed: %v", err)
	}

	// Assert: in-memory value is changed
	if cs.GetVaultPath() != newPath {
		t.Errorf("In-memory vault path should be %q, got %q", newPath, cs.GetVaultPath())
	}

	// Assert: config file is also updated
	var savedCfg models.Config
	if _, err := toml.DecodeFile(configPath, &savedCfg); err != nil {
		t.Fatalf("Failed to read config file: %v", err)
	}
	if savedCfg.Vault.Path != newPath {
		t.Errorf("Config file vault path should be %q, got %q", newPath, savedCfg.Vault.Path)
	}
}

func TestConfigService_SetTheme_DoesPersist(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.toml")

	// Write initial config with default theme
	cfg := models.DefaultConfig()
	cfg.Vault.Path = "/test/vault"
	cfg.UI.Theme = "catppuccin"
	writeTestConfig(t, configPath, cfg)

	cs := &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Verify initial theme
	if cs.config.UI.Theme != "catppuccin" {
		t.Fatalf("Expected initial theme %q, got %q", "catppuccin", cs.config.UI.Theme)
	}

	// Act: change theme
	if err := cs.SetTheme("dracula"); err != nil {
		t.Fatalf("SetTheme failed: %v", err)
	}

	// Assert: in-memory value changed
	if cs.config.UI.Theme != "dracula" {
		t.Errorf("In-memory theme should be %q, got %q", "dracula", cs.config.UI.Theme)
	}

	// Assert: config file is updated
	var savedCfg models.Config
	if _, err := toml.DecodeFile(configPath, &savedCfg); err != nil {
		t.Fatalf("Failed to read config file: %v", err)
	}
	if savedCfg.UI.Theme != "dracula" {
		t.Errorf("Config file theme should be %q, got %q", "dracula", savedCfg.UI.Theme)
	}

	// Assert: other config values are preserved
	if savedCfg.Vault.Path != "/test/vault" {
		t.Errorf("Vault path should be preserved as %q, got %q", "/test/vault", savedCfg.Vault.Path)
	}
}

func TestConfigService_LoadDoesNotSaveExistingConfig(t *testing.T) {
	// Setup: create a temp dir with a real config.toml
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.toml")
	originalVault := "/my/vault"

	// Write minimal config file (only vault path)
	cfg := &models.Config{
		Vault: models.VaultConfig{Path: originalVault},
	}
	writeTestConfig(t, configPath, cfg)

	// Record file modification time before Load
	infoBefore, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("Failed to stat config file: %v", err)
	}

	// Create ConfigService and Load
	cs := &ConfigService{
		configPath: configPath,
		config:     models.DefaultConfig(),
	}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Assert: config file was NOT modified by Load
	infoAfter, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("Failed to stat config file after Load: %v", err)
	}
	if infoBefore.ModTime() != infoAfter.ModTime() {
		t.Errorf("Load() should not modify the config file when it already exists")
	}

	// Assert: in-memory vault is correct
	if cs.GetVaultPath() != originalVault {
		t.Errorf("Expected vault path %q, got %q", originalVault, cs.GetVaultPath())
	}
}

func TestConfigService_Load_UsesSharedConfigAsBaseForDevConfig(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sharedPath := filepath.Join(tmpDir, "config.toml")
	devPath := filepath.Join(tmpDir, "config.dev.toml")

	sharedCfg := models.DefaultConfig()
	sharedCfg.Vault.Path = "/shared/vault"
	sharedCfg.UI.Theme = "tokyonight"
	sharedCfg.Editor.FontSize = 18
	writeTestConfig(t, sharedPath, sharedCfg)

	if err := os.WriteFile(devPath, []byte("[ui]\ntheme = \"catppuccin\"\n"), 0644); err != nil {
		t.Fatalf("Failed to write dev config: %v", err)
	}

	cs := &ConfigService{
		configPath:       devPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		useDevConfig:     true,
		config:           models.DefaultConfig(),
	}

	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cs.GetVaultPath() != "/shared/vault" {
		t.Fatalf("Expected shared vault path to survive overlay, got %q", cs.GetVaultPath())
	}
	if cs.config.UI.Theme != "catppuccin" {
		t.Fatalf("Expected dev theme override, got %q", cs.config.UI.Theme)
	}
	if cs.config.Editor.FontSize != 18 {
		t.Fatalf("Expected shared editor settings to remain, got %d", cs.config.Editor.FontSize)
	}
}

func TestConfigService_CustomConfig_DoesNotSyncSharedConfig(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	customPath := filepath.Join(tmpDir, "custom.toml")
	sharedPath := filepath.Join(tmpDir, "config.toml")

	customCfg := models.DefaultConfig()
	customCfg.UI.Theme = "catppuccin"
	writeTestConfig(t, customPath, customCfg)

	sharedCfg := models.DefaultConfig()
	sharedCfg.UI.Theme = "github-light"
	writeTestConfig(t, sharedPath, sharedCfg)

	cs := &ConfigService{
		configPath:       customPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		useCustomConfig:  true,
		config:           models.DefaultConfig(),
	}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if err := cs.SetTheme("tokyonight"); err != nil {
		t.Fatalf("SetTheme failed: %v", err)
	}

	var savedShared models.Config
	if _, err := toml.DecodeFile(sharedPath, &savedShared); err != nil {
		t.Fatalf("Failed to decode shared config: %v", err)
	}
	if savedShared.UI.Theme != "github-light" {
		t.Fatalf("Expected shared config to stay untouched, got %q", savedShared.UI.Theme)
	}
}

func TestConfigService_Load_SeedsSharedConfigFromDevWhenMissing(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devPath := filepath.Join(tmpDir, "config.dev.toml")
	sharedPath := filepath.Join(tmpDir, "config.toml")

	devCfg := models.DefaultConfig()
	devCfg.Vault.Path = "/vault/from/dev"
	devCfg.UI.Theme = "dracula"
	writeTestConfigFile(t, devPath, devCfg)

	cs := &ConfigService{
		configPath:       devPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		useDevConfig:     true,
		config:           models.DefaultConfig(),
	}

	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cs.GetVaultPath() != "/vault/from/dev" {
		t.Fatalf("Expected merged vault path from dev config, got %q", cs.GetVaultPath())
	}
	if cs.GetConfig().UI.Theme != "dracula" {
		t.Fatalf("Expected merged theme from dev config, got %q", cs.GetConfig().UI.Theme)
	}

	sharedCfg := readTestConfigFile(t, sharedPath)
	if sharedCfg.Vault.Path != "/vault/from/dev" {
		t.Errorf("Shared config vault path should be seeded from dev config, got %q", sharedCfg.Vault.Path)
	}
	if sharedCfg.UI.Theme != "dracula" {
		t.Errorf("Shared config theme should be seeded from dev config, got %q", sharedCfg.UI.Theme)
	}
}

func TestConfigService_SetTheme_SyncsSharedAndDevConfigs(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sharedPath := filepath.Join(tmpDir, "config.toml")
	devPath := filepath.Join(tmpDir, "config.dev.toml")

	sharedCfg := models.DefaultConfig()
	sharedCfg.UI.Theme = "github-light"
	writeTestConfigFile(t, sharedPath, sharedCfg)

	devCfg := models.DefaultConfig()
	devCfg.UI.Theme = "dracula"
	writeTestConfigFile(t, devPath, devCfg)

	t.Run("prod save updates dev peer", func(t *testing.T) {
		cs := &ConfigService{
			configPath:       sharedPath,
			sharedConfigPath: sharedPath,
			configDir:        tmpDir,
			config:           models.DefaultConfig(),
		}

		if err := cs.Load(); err != nil {
			t.Fatalf("Load failed: %v", err)
		}
		if err := cs.SetTheme("tokyonight"); err != nil {
			t.Fatalf("SetTheme failed: %v", err)
		}

		if got := readTestConfigFile(t, sharedPath).UI.Theme; got != "tokyonight" {
			t.Errorf("shared config theme = %q, want %q", got, "tokyonight")
		}
		if got := readTestConfigFile(t, devPath).UI.Theme; got != "tokyonight" {
			t.Errorf("dev config theme = %q, want %q", got, "tokyonight")
		}
	})

	t.Run("dev save updates shared peer", func(t *testing.T) {
		cs := &ConfigService{
			configPath:       devPath,
			sharedConfigPath: sharedPath,
			configDir:        tmpDir,
			useDevConfig:     true,
			config:           models.DefaultConfig(),
		}

		if err := cs.Load(); err != nil {
			t.Fatalf("Load failed: %v", err)
		}
		if err := cs.SetTheme("catppuccin"); err != nil {
			t.Fatalf("SetTheme failed: %v", err)
		}

		if got := readTestConfigFile(t, sharedPath).UI.Theme; got != "catppuccin" {
			t.Errorf("shared config theme = %q, want %q", got, "catppuccin")
		}
		if got := readTestConfigFile(t, devPath).UI.Theme; got != "catppuccin" {
			t.Errorf("dev config theme = %q, want %q", got, "catppuccin")
		}
	})
}

func TestConfigService_SetVaultPath_SyncsSharedAndDevConfigs(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sharedPath := filepath.Join(tmpDir, "config.toml")
	devPath := filepath.Join(tmpDir, "config.dev.toml")

	writeTestConfigFile(t, sharedPath, models.DefaultConfig())
	writeTestConfigFile(t, devPath, models.DefaultConfig())

	cs := &ConfigService{
		configPath:       sharedPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		config:           models.DefaultConfig(),
	}

	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	newPath := "/vault/synced"
	if err := cs.SetVaultPath(newPath); err != nil {
		t.Fatalf("SetVaultPath failed: %v", err)
	}

	if got := readTestConfigFile(t, sharedPath).Vault.Path; got != newPath {
		t.Errorf("shared config vault path = %q, want %q", got, newPath)
	}
	if got := readTestConfigFile(t, devPath).Vault.Path; got != newPath {
		t.Errorf("dev config vault path = %q, want %q", got, newPath)
	}
}
