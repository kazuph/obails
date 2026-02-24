package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
)

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
	f, err := os.Create(configPath)
	if err != nil {
		t.Fatalf("Failed to create config file: %v", err)
	}
	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		t.Fatalf("Failed to write config: %v", err)
	}
	f.Close()

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
	f, err := os.Create(configPath)
	if err != nil {
		t.Fatalf("Failed to create config file: %v", err)
	}
	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		t.Fatalf("Failed to write config: %v", err)
	}
	f.Close()

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
	f, err := os.Create(configPath)
	if err != nil {
		t.Fatalf("Failed to create config file: %v", err)
	}
	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		t.Fatalf("Failed to write config: %v", err)
	}
	f.Close()

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
