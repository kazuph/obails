package services

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"sync"
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

func TestConfigService_SetDeleteMode_DoesPersist(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "obails-config-test-*")
	if err != nil {
		t.Fatalf("MkdirTemp failed: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.toml")
	writeTestConfig(t, configPath, models.DefaultConfig())
	cs := &ConfigService{configPath: configPath, config: models.DefaultConfig()}
	if err := cs.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cs.GetDeleteMode() != models.DeleteModeSystemTrash {
		t.Fatalf("Expected system trash default, got %q", cs.GetDeleteMode())
	}

	if err := cs.SetDeleteMode(models.DeleteModeVaultTrash); err != nil {
		t.Fatalf("SetDeleteMode failed: %v", err)
	}
	if cs.GetDeleteMode() != models.DeleteModeVaultTrash {
		t.Fatalf("Unexpected in-memory delete mode %q", cs.GetDeleteMode())
	}
	if got := readTestConfigFile(t, configPath).Vault.DeleteMode; got != models.DeleteModeVaultTrash {
		t.Fatalf("Unexpected persisted delete mode %q", got)
	}
	if err := cs.SetDeleteMode(models.DeleteMode("invalid")); err == nil {
		t.Fatal("Expected invalid delete mode error")
	}
}

func TestConfigService_FileExplorerPreferencesPersist(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	cs := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := cs.SetFileExplorerAutoReveal(false); err != nil {
		t.Fatalf("SetFileExplorerAutoReveal failed: %v", err)
	}
	if err := cs.SetFileExplorerSort("created", "descending"); err != nil {
		t.Fatalf("SetFileExplorerSort failed: %v", err)
	}
	got := cs.GetFileExplorerConfig()
	if got.AutoReveal || got.SortField != "created" || got.SortDirection != "descending" {
		t.Fatalf("unexpected explorer config: %#v", got)
	}
	saved := readTestConfigFile(t, configPath).UI.FileExplorer
	if saved.AutoReveal || saved.SortField != "created" || saved.SortDirection != "descending" {
		t.Fatalf("preferences were not persisted: %#v", saved)
	}
	if err := cs.SetFileExplorerSort("size", "ascending"); err == nil {
		t.Fatal("invalid sort field was accepted")
	}
}

func TestConfigService_LoadHotkeysFailsClosedAndCanonicalizesValidOverrides(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")

	for name, contents := range map[string]string{
		"unknown command": "[hotkeys]\nunknown = \"Cmd+K\"\n",
		"invalid chord":   "[hotkeys]\nnew-note = \"Cmd+Shift\"\n",
		"same scope":      "[hotkeys]\nnew-note = \"Cmd+K\"\ncommand-palette = \"Cmd+K\"\n",
	} {
		t.Run(name, func(t *testing.T) {
			if err := os.WriteFile(configPath, []byte(contents), 0644); err != nil {
				t.Fatalf("write config: %v", err)
			}
			baseline := models.DefaultConfig()
			baseline.UI.Theme = "dracula"
			service := &ConfigService{configPath: configPath, useCustomConfig: true, config: baseline}
			if err := service.Load(); err == nil {
				t.Fatal("Load accepted invalid hotkey config")
			}
			if got := service.GetTheme(); got != "dracula" {
				t.Fatalf("Load changed runtime config after failure: %q", got)
			}
		})
	}

	if err := os.WriteFile(configPath, []byte("[hotkeys]\nnew-note = \" shift + command + n \"\n"), 0644); err != nil {
		t.Fatalf("write valid config: %v", err)
	}
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := service.Load(); err != nil {
		t.Fatalf("Load valid config: %v", err)
	}
	if got := service.GetHotkeyMappings()[models.CommandNewNote]; got != "Cmd+Shift+N" {
		t.Fatalf("runtime canonical hotkey = %q", got)
	}
	if got := readTestConfigFile(t, configPath).Hotkeys[models.CommandNewNote]; got != "Cmd+Shift+N" {
		t.Fatalf("persisted canonical hotkey = %q", got)
	}
}

func TestConfigService_LoadCanonicalizationRollsBackAllFiles(t *testing.T) {
	root := t.TempDir()
	sharedPath := filepath.Join(root, "config.toml")
	devDir := filepath.Join(root, "dev")
	devPath := filepath.Join(devDir, "config.dev.toml")
	if err := os.MkdirAll(devDir, 0755); err != nil {
		t.Fatal(err)
	}
	sharedBefore := []byte("[ui]\nsidebar_width = 250\n[hotkeys]\nnew-note = 'command+n'\n")
	devBefore := []byte("[hotkeys]\ncommand-palette = 'command+p'\n")
	if err := os.WriteFile(sharedPath, sharedBefore, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(devPath, devBefore, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(devDir, 0555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(devDir, 0755) })

	service := &ConfigService{
		config:           models.DefaultConfig(),
		configPath:       devPath,
		sharedConfigPath: sharedPath,
		configDir:        root,
		useDevConfig:     true,
	}
	if err := service.Load(); err == nil {
		t.Fatal("Load succeeded after the development config became unwritable")
	}
	sharedAfter, err := os.ReadFile(sharedPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(sharedAfter, sharedBefore) {
		t.Fatalf("shared config was not rolled back: %q", sharedAfter)
	}
	if got := service.GetHotkeyMappings(); len(got) != 0 {
		t.Fatalf("runtime config changed after failed Load: %#v", got)
	}
}

func TestConfigService_SidebarWidthLoadAndSetUseUIBounds(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	for _, width := range []int{models.MinSidebarWidth, models.MaxSidebarWidth} {
		if err := service.SetSidebarWidth(width); err != nil {
			t.Fatalf("SetSidebarWidth(%d): %v", width, err)
		}
		if got := service.GetSidebarWidth(); got != width {
			t.Fatalf("runtime sidebar width = %d, want %d", got, width)
		}
	}
	if err := os.WriteFile(configPath, []byte("[ui]\nsidebar_width = 501\n"), 0644); err != nil {
		t.Fatalf("write invalid sidebar config: %v", err)
	}
	baseline := models.DefaultConfig()
	baseline.UI.SidebarWidth = models.MinSidebarWidth
	failedLoad := &ConfigService{configPath: configPath, useCustomConfig: true, config: baseline}
	if err := failedLoad.Load(); err == nil {
		t.Fatal("Load accepted a sidebar width outside the UI range")
	}
	if got := failedLoad.GetSidebarWidth(); got != models.MinSidebarWidth {
		t.Fatalf("Load changed runtime sidebar width after failure: %d", got)
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

func TestConfigService_DevOverlaySetterKeepsOnlyExplicitLeaves(t *testing.T) {
	tmpDir := t.TempDir()
	sharedPath := filepath.Join(tmpDir, "config.toml")
	devPath := filepath.Join(tmpDir, "config.dev.toml")

	shared := models.DefaultConfig()
	shared.Vault.Path = "/shared/vault"
	shared.Editor.FontFamily = "Iosevka"
	writeTestConfigFile(t, sharedPath, shared)
	if err := os.WriteFile(devPath, []byte("[ui]\ntheme = \"catppuccin\"\n"), 0644); err != nil {
		t.Fatalf("write sparse dev config: %v", err)
	}

	service := &ConfigService{
		configPath:       devPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		useDevConfig:     true,
		config:           models.DefaultConfig(),
	}
	if err := service.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if err := service.SetTheme("dracula"); err != nil {
		t.Fatalf("SetTheme failed: %v", err)
	}
	if err := service.SetHotkey(models.CommandNewNote, "shift + cmd + n"); err != nil {
		t.Fatalf("SetHotkey failed: %v", err)
	}

	var document map[string]interface{}
	if _, err := toml.DecodeFile(devPath, &document); err != nil {
		t.Fatalf("decode sparse dev config: %v", err)
	}
	if len(document) != 2 {
		t.Fatalf("dev config wrote unrelated tables: %#v", document)
	}
	ui, ok := document["ui"].(map[string]interface{})
	if !ok || len(ui) != 1 || ui["theme"] != "dracula" {
		t.Fatalf("dev theme leaf = %#v, want only dracula", document)
	}
	hotkeys, ok := document["hotkeys"].(map[string]interface{})
	if !ok || len(hotkeys) != 1 || hotkeys[models.CommandNewNote] != "Cmd+Shift+N" {
		t.Fatalf("dev hotkey leaf = %#v, want only canonical override", document)
	}
	if got := service.GetVaultPath(); got != "/shared/vault" {
		t.Fatalf("runtime shared vault changed to %q", got)
	}
	if got := service.GetEditorConfig().FontFamily; got != "Iosevka" {
		t.Fatalf("runtime shared editor config changed to %q", got)
	}
}

func TestConfigService_SetterFailureRollsBackFilesAndRuntime(t *testing.T) {
	tmpDir := t.TempDir()
	activeDir := filepath.Join(tmpDir, "active")
	peerDir := filepath.Join(tmpDir, "peer")
	if err := os.MkdirAll(activeDir, 0755); err != nil {
		t.Fatalf("create active directory: %v", err)
	}
	if err := os.MkdirAll(peerDir, 0755); err != nil {
		t.Fatalf("create peer directory: %v", err)
	}
	activePath := filepath.Join(activeDir, "config.toml")
	sharedPath := filepath.Join(peerDir, "config.toml")
	devPath := filepath.Join(peerDir, "config.dev.toml")
	activeBefore := models.DefaultConfig()
	activeBefore.UI.Theme = "catppuccin"
	sharedBefore := models.DefaultConfig()
	sharedBefore.UI.Theme = "github-light"
	writeTestConfigFile(t, activePath, activeBefore)
	writeTestConfigFile(t, sharedPath, sharedBefore)
	if err := os.Chmod(peerDir, 0555); err != nil {
		t.Fatalf("make peer directory read-only: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(peerDir, 0755) })

	service := &ConfigService{
		configPath:       activePath,
		sharedConfigPath: sharedPath,
		configDir:        peerDir,
		config:           models.DefaultConfig(),
	}
	if err := service.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if err := service.SetTheme("dracula"); err == nil {
		t.Fatal("expected peer persistence failure")
	}
	if got := service.GetTheme(); got != "github-light" {
		t.Fatalf("runtime theme changed after failed save: %q", got)
	}
	if got := readTestConfigFile(t, activePath).UI.Theme; got != "catppuccin" {
		t.Fatalf("active config was not rolled back: %q", got)
	}
	if got := readTestConfigFile(t, sharedPath).UI.Theme; got != "github-light" {
		t.Fatalf("peer config changed after failed save: %q", got)
	}
	if _, err := os.Stat(devPath); !os.IsNotExist(err) {
		t.Fatalf("failed transaction created dev peer: %v", err)
	}
}

func TestConfigService_ConcurrentSettersPreserveBothChanges(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	var start sync.WaitGroup
	start.Add(1)
	errs := make(chan error, 3)
	go func() {
		start.Wait()
		errs <- service.SetTheme("dracula")
	}()
	go func() {
		start.Wait()
		errs <- service.SetEditorFontSize(17)
	}()
	go func() {
		start.Wait()
		errs <- service.SetHotkey(models.CommandNewNote, "Cmd+Shift+N")
	}()
	start.Done()
	for range 3 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent setter failed: %v", err)
		}
	}
	saved := readTestConfigFile(t, configPath)
	if saved.UI.Theme != "dracula" || saved.Editor.FontSize != 17 || saved.Hotkeys[models.CommandNewNote] != "Cmd+Shift+N" {
		t.Fatalf("lost config update: %#v", saved)
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

func TestConfigService_AttachmentConfigPersistsAndRejectsUnsafeValues(t *testing.T) {
	tmpDir := t.TempDir()
	vaultPath := filepath.Join(tmpDir, "vault")
	if err := os.MkdirAll(vaultPath, 0755); err != nil {
		t.Fatalf("create vault: %v", err)
	}
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{
		configPath:      configPath,
		useCustomConfig: true,
		config:          models.DefaultConfig(),
	}
	service.config.Vault.Path = vaultPath

	defaultConfig, err := service.GetAttachmentConfig()
	if err != nil {
		t.Fatalf("GetAttachmentConfig default: %v", err)
	}
	if defaultConfig != models.DefaultAttachmentConfig() {
		t.Fatalf("default attachment config = %#v", defaultConfig)
	}

	valid := models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "attachments/shared"}
	if err := service.SetAttachmentConfig(valid); err != nil {
		t.Fatalf("SetAttachmentConfig: %v", err)
	}
	if got, err := service.GetAttachmentConfig(); err != nil || got != valid {
		t.Fatalf("runtime attachment config = %#v, %v", got, err)
	}
	if got := readTestConfigFile(t, configPath).Attachment; got != valid {
		t.Fatalf("persisted attachment config = %#v", got)
	}

	for _, invalid := range []models.AttachmentConfig{
		{Location: "unknown"},
		{Location: models.AttachmentLocationVaultRoot, Folder: "attachments"},
		{Location: models.AttachmentLocationCurrentFolder, Folder: "attachments"},
		{Location: models.AttachmentLocationVaultFolder},
		{Location: models.AttachmentLocationCurrentSubfolder},
		{Location: models.AttachmentLocationVaultFolder, Folder: "/attachments"},
		{Location: models.AttachmentLocationVaultFolder, Folder: "./attachments"},
		{Location: models.AttachmentLocationVaultFolder, Folder: "attachments/../other"},
		{Location: models.AttachmentLocationVaultFolder, Folder: `attachments\other`},
	} {
		if err := service.SetAttachmentConfig(invalid); err == nil {
			t.Fatalf("SetAttachmentConfig accepted %#v", invalid)
		}
	}
	if got := readTestConfigFile(t, configPath).Attachment; got != valid {
		t.Fatalf("invalid update changed persisted attachment config: %#v", got)
	}

	outsidePath := filepath.Join(tmpDir, "outside")
	if err := os.MkdirAll(outsidePath, 0755); err != nil {
		t.Fatalf("create outside directory: %v", err)
	}
	if err := os.Symlink(outsidePath, filepath.Join(vaultPath, "escape")); err != nil {
		t.Fatalf("create vault symlink: %v", err)
	}
	if err := service.SetAttachmentConfig(models.AttachmentConfig{Location: models.AttachmentLocationVaultFolder, Folder: "escape"}); !errors.Is(err, ErrInvalidPath) {
		t.Fatalf("outside symlink error = %v, want ErrInvalidPath", err)
	}
}

func TestConfigService_AttachmentConfigLoadAndSparseDevOverlay(t *testing.T) {
	tmpDir := t.TempDir()
	vaultPath := filepath.Join(tmpDir, "vault")
	if err := os.MkdirAll(vaultPath, 0755); err != nil {
		t.Fatalf("create vault: %v", err)
	}
	sharedPath := filepath.Join(tmpDir, "config.toml")
	devPath := filepath.Join(tmpDir, "config.dev.toml")
	shared := models.DefaultConfig()
	shared.Vault.Path = vaultPath
	writeTestConfigFile(t, sharedPath, shared)
	if err := os.WriteFile(devPath, []byte("[ui]\ntheme = \"catppuccin\"\n"), 0644); err != nil {
		t.Fatalf("write sparse dev config: %v", err)
	}

	service := &ConfigService{
		configPath:       devPath,
		sharedConfigPath: sharedPath,
		configDir:        tmpDir,
		useDevConfig:     true,
		config:           models.DefaultConfig(),
	}
	if err := service.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	config := models.AttachmentConfig{Location: models.AttachmentLocationCurrentSubfolder, Folder: "media"}
	if err := service.SetAttachmentConfig(config); err != nil {
		t.Fatalf("SetAttachmentConfig: %v", err)
	}

	var document map[string]interface{}
	if _, err := toml.DecodeFile(devPath, &document); err != nil {
		t.Fatalf("decode sparse dev config: %v", err)
	}
	attachment, ok := document["attachment"].(map[string]interface{})
	if !ok || len(attachment) != 2 || attachment["location"] != "current_subfolder" || attachment["folder"] != "media" {
		t.Fatalf("dev attachment overlay = %#v", document)
	}
	if got := readTestConfigFile(t, sharedPath).Attachment; got != config {
		t.Fatalf("shared attachment config = %#v", got)
	}

	legacyPath := filepath.Join(tmpDir, "legacy.toml")
	if err := os.WriteFile(legacyPath, []byte("[vault]\npath = \""+vaultPath+"\"\n"), 0644); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}
	legacy := &ConfigService{configPath: legacyPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := legacy.Load(); err != nil {
		t.Fatalf("Load legacy config: %v", err)
	}
	if got, err := legacy.GetAttachmentConfig(); err != nil || got != models.DefaultAttachmentConfig() {
		t.Fatalf("legacy attachment config = %#v, %v", got, err)
	}

	unknownPath := filepath.Join(tmpDir, "unknown.toml")
	if err := os.WriteFile(unknownPath, []byte("[vault]\npath = \""+vaultPath+"\"\n[attachment]\nlocation = \"unknown\"\n"), 0644); err != nil {
		t.Fatalf("write unknown config: %v", err)
	}
	unknown := &ConfigService{configPath: unknownPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := unknown.Load(); err == nil {
		t.Fatal("Load accepted unknown attachment location")
	}
}
