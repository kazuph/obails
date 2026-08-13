package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/kazuph/obails/models"
)

// ConfigService handles application configuration
type ConfigService struct {
	mu               sync.RWMutex
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
	s.mu.Lock()
	defer s.mu.Unlock()
	s.normalizePaths()

	if err := os.MkdirAll(filepath.Dir(s.configPath), 0755); err != nil {
		return err
	}

	if s.useCustomConfig {
		if _, err := os.Stat(s.configPath); os.IsNotExist(err) {
			cfg := models.DefaultConfig()
			if err := writeConfigFile(s.configPath, cfg); err != nil {
				return err
			}
			s.config = cfg
			return nil
		}

		cfg := models.DefaultConfig()
		if _, err := toml.DecodeFile(s.configPath, cfg); err != nil {
			return err
		}
		changed, err := normalizeHotkeyOverrides(cfg.Hotkeys)
		if err != nil {
			return err
		}
		normalizeLegacySidebarWidth(cfg)
		if err := validateLoadedConfig(cfg); err != nil {
			return err
		}
		if err := validateAttachmentConfigForVault(cfg.Attachment, cfg.Vault.Path); err != nil {
			return err
		}
		if changed {
			if err := writeConfigFile(s.configPath, cfg); err != nil {
				return err
			}
		}

		s.config = cfg
		return nil
	}

	if err := os.MkdirAll(s.configDir, 0755); err != nil {
		return err
	}

	cfg := models.DefaultConfig()
	sharedExists := false
	var sharedConfig *models.Config
	sharedHotkeysChanged := false
	if _, err := os.Stat(s.sharedConfigPath); err == nil {
		if _, err := toml.DecodeFile(s.sharedConfigPath, cfg); err != nil {
			return err
		}
		sharedConfig = cfg.Clone()
		var err error
		sharedHotkeysChanged, err = normalizeHotkeyOverrides(sharedConfig.Hotkeys)
		if err != nil {
			return err
		}
		cfg = sharedConfig.Clone()
		sharedExists = true
	} else if !os.IsNotExist(err) {
		return err
	}

	activeExists := false
	var overlayConfig *models.Config
	overlayHotkeysChanged := false
	if s.useDevConfig {
		if _, err := os.Stat(s.configPath); err == nil {
			overlay := &models.Config{}
			metadata, err := toml.DecodeFile(s.configPath, overlay)
			if err != nil {
				return err
			}
			overlayConfig = overlay
			overlayHotkeysChanged, err = normalizeHotkeyOverrides(overlay.Hotkeys)
			if err != nil {
				return err
			}
			mergeConfigOverlay(cfg, overlay, metadata)
			activeExists = true
		} else if !os.IsNotExist(err) {
			return err
		}
	}

	normalizeLegacySidebarWidth(cfg)
	if err := validateLoadedConfig(cfg); err != nil {
		return err
	}
	if err := validateAttachmentConfigForVault(cfg.Attachment, cfg.Vault.Path); err != nil {
		return err
	}
	loadWrites := make([]configWrite, 0, 2)
	if !sharedExists {
		if activeExists {
			loadWrites = append(loadWrites, configWrite{path: s.sharedConfigPath, cfg: cfg})
		} else {
			loadWrites = append(loadWrites, configWrite{path: s.sharedConfigPath, cfg: models.DefaultConfig()})
		}
	}
	if sharedHotkeysChanged && sharedConfig != nil {
		loadWrites = append(loadWrites, configWrite{path: s.sharedConfigPath, cfg: sharedConfig})
	}
	if overlayHotkeysChanged && overlayConfig != nil {
		document, err := readConfigOverlayDocument(s.configPath)
		if err != nil {
			return err
		}
		for commandID, hotkey := range overlayConfig.Hotkeys {
			setConfigDocumentLeaf(document, []string{"hotkeys", commandID}, hotkey)
		}
		loadWrites = append(loadWrites, configWrite{path: s.configPath, document: document})
	}
	if err := writeConfigTargetsAtomically(loadWrites); err != nil {
		return err
	}

	s.config = cfg
	return nil
}

// Save writes configuration to file
func (s *ConfigService) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.normalizePaths()

	if err := os.MkdirAll(filepath.Dir(s.configPath), 0755); err != nil {
		return err
	}

	return writeConfigFile(s.configPath, s.config.Clone())
}

// GetConfig returns the current configuration
func (s *ConfigService) GetConfig() *models.Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Clone()
}

// GetVaultPath returns the vault path
func (s *ConfigService) GetVaultPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Vault.Path
}

// GetAttachmentConfig returns the persisted attachment destination choice.
func (s *ConfigService) GetAttachmentConfig() (models.AttachmentConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return models.NormalizeAttachmentConfig(s.config.Attachment)
}

// SetAttachmentConfig validates and atomically persists an attachment destination choice.
func (s *ConfigService) SetAttachmentConfig(config models.AttachmentConfig) error {
	normalized, err := models.NormalizeAttachmentConfig(config)
	if err != nil {
		return err
	}
	return s.updateConfig(func(cfg *models.Config) error {
		if err := validateAttachmentConfigForVault(normalized, cfg.Vault.Path); err != nil {
			return err
		}
		cfg.Attachment = normalized
		return nil
	})
}

func validateAttachmentConfigForVault(config models.AttachmentConfig, vaultPath string) error {
	normalized, err := models.NormalizeAttachmentConfig(config)
	if err != nil {
		return err
	}
	if normalized.Folder == "" || vaultPath == "" {
		return nil
	}
	realVaultPath, err := filepath.EvalSymlinks(vaultPath)
	if err != nil {
		return err
	}
	realVaultPath, err = filepath.Abs(realVaultPath)
	if err != nil {
		return err
	}
	return ensurePathWithinVault(realVaultPath, filepath.Join(realVaultPath, filepath.FromSlash(normalized.Folder)))
}

// GetRecoverySnapshotInterval returns the configured interval, falling back to
// the documented five-minute default for configurations written before recovery.
func (s *ConfigService) GetRecoverySnapshotInterval() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	minutes := s.config.Recovery.SnapshotIntervalMinutes
	if minutes < models.DefaultRecoverySnapshotIntervalMinutes {
		minutes = models.DefaultRecoverySnapshotIntervalMinutes
	}
	return time.Duration(minutes) * time.Minute
}

// GetRecoveryRetention returns the configured retention, falling back to the
// documented seven-day default for configurations written before recovery.
func (s *ConfigService) GetRecoveryRetention() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	days := s.config.Recovery.RetentionDays
	if days < models.MinimumRecoveryRetentionDays {
		days = models.DefaultRecoveryRetentionDays
	}
	return time.Duration(days) * 24 * time.Hour
}

// SetFileRecoveryConfig persists supported recovery timings.
func (s *ConfigService) SetFileRecoveryConfig(config models.FileRecoveryConfig) error {
	if config.SnapshotIntervalMinutes < models.DefaultRecoverySnapshotIntervalMinutes || config.RetentionDays < models.MinimumRecoveryRetentionDays {
		return fmt.Errorf("invalid file recovery configuration")
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Recovery = config
		return nil
	})
}

// GetRecoveryDataDir returns the data directory used for recovery copies. It
// refuses locations contained by the active vault so deleting a vault cannot
// delete its recovery data too.
func (s *ConfigService) GetRecoveryDataDir() (string, error) {
	s.mu.Lock()
	s.normalizePaths()
	dataDir := filepath.Join(s.configDir, "data")
	vaultPath := s.config.Vault.Path
	s.mu.Unlock()
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return "", err
	}
	realDataDir, err := filepath.EvalSymlinks(dataDir)
	if err != nil {
		return "", err
	}
	vaultPath, err = filepath.EvalSymlinks(vaultPath)
	if err != nil {
		return "", err
	}
	if isWithinVault(vaultPath, realDataDir) {
		return "", fmt.Errorf("recovery data directory is inside the vault")
	}
	return realDataDir, nil
}

// GetDeleteMode returns the safe default for configs written before this field
// existed.
func (s *ConfigService) GetDeleteMode() models.DeleteMode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.config.Vault.DeleteMode == "" {
		return models.DeleteModeSystemTrash
	}
	return s.config.Vault.DeleteMode
}

// SetDeleteMode persists a supported deletion destination.
func (s *ConfigService) SetDeleteMode(mode models.DeleteMode) error {
	if !mode.IsValid() {
		return fmt.Errorf("invalid delete mode: %q", mode)
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Vault.DeleteMode = mode
		return nil
	})
}

// SetVaultPath sets the vault path and saves to config file (permanent change).
//
//wails:ignore
func (s *ConfigService) SetVaultPath(path string) error {
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Vault.Path = path
		return nil
	})
}

// OverrideVaultPath overrides the vault path in memory only (does NOT save to config file).
// Use this for temporary overrides like the --vault CLI flag.
//
//wails:ignore
func (s *ConfigService) OverrideVaultPath(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config.Vault.Path = path
}

// GetDailyNotesFolder returns the daily notes folder relative path
func (s *ConfigService) GetDailyNotesFolder() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.DailyNotes.Folder
}

// GetDailyNotesFormat returns the daily notes date format
func (s *ConfigService) GetDailyNotesFormat() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.DailyNotes.Format
}

// GetTimelineSection returns the Timeline section header
func (s *ConfigService) GetTimelineSection() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Timeline.Section
}

// GetTimelineTimeFormat returns the Timeline time format
func (s *ConfigService) GetTimelineTimeFormat() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Timeline.TimeFormat
}

// GetTemplatesFolder returns the templates folder relative path
func (s *ConfigService) GetTemplatesFolder() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Templates.Folder
}

// SetTheme sets the UI theme and saves to config file.
func (s *ConfigService) SetTheme(theme string) error {
	theme = strings.TrimSpace(theme)
	if !models.IsSupportedTheme(theme) {
		return fmt.Errorf("unsupported theme: %q", theme)
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.UI.Theme = theme
		return nil
	})
}

// GetTheme returns the configured theme, defaulting configurations written before UI preferences.
func (s *ConfigService) GetTheme() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if theme := strings.TrimSpace(s.config.UI.Theme); theme != "" {
		return theme
	}
	return models.DefaultConfig().UI.Theme
}

// GetEditorConfig returns the editor preferences with defaults for older configurations.
func (s *ConfigService) GetEditorConfig() models.EditorConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	config := s.config.Editor
	defaults := models.DefaultConfig().Editor
	if config.FontSize <= 0 {
		config.FontSize = defaults.FontSize
	}
	if strings.TrimSpace(config.FontFamily) == "" {
		config.FontFamily = defaults.FontFamily
	}
	return config
}

func (s *ConfigService) SetEditorFontFamily(fontFamily string) error {
	fontFamily = strings.TrimSpace(fontFamily)
	if fontFamily == "" {
		return fmt.Errorf("editor font family is required")
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Editor.FontFamily = fontFamily
		return nil
	})
}

func (s *ConfigService) SetEditorFontSize(fontSize int) error {
	if fontSize <= 0 {
		return fmt.Errorf("editor font size must be positive")
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Editor.FontSize = fontSize
		return nil
	})
}

func (s *ConfigService) SetEditorLineNumbers(enabled bool) error {
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Editor.LineNumbers = enabled
		return nil
	})
}

func (s *ConfigService) SetEditorWordWrap(enabled bool) error {
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.Editor.WordWrap = enabled
		return nil
	})
}

// GetSidebarWidth returns the configured width, defaulting configurations written before UI preferences.
func (s *ConfigService) GetSidebarWidth() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if models.IsSupportedSidebarWidth(s.config.UI.SidebarWidth) {
		return s.config.UI.SidebarWidth
	}
	return models.DefaultConfig().UI.SidebarWidth
}

func (s *ConfigService) SetSidebarWidth(width int) error {
	if !models.IsSupportedSidebarWidth(width) {
		return fmt.Errorf("sidebar width must be between %d and %d", models.MinSidebarWidth, models.MaxSidebarWidth)
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.UI.SidebarWidth = width
		return nil
	})
}

// GetCommandDescriptors returns existing command metadata with persisted user hotkeys applied.
func (s *ConfigService) GetCommandDescriptors() []models.CommandDescriptor {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return commandDescriptorsForConfig(s.config)
}

func commandDescriptorsForConfig(config *models.Config) []models.CommandDescriptor {
	commands := models.CommandDescriptors()
	for index := range commands {
		if hotkey, ok := config.Hotkeys[commands[index].ID]; ok {
			if canonical, err := models.NormalizeHotkeyChord(hotkey); err == nil {
				commands[index].Hotkey = canonical
			}
		}
	}
	return commands
}

// GetHotkeyMappings returns a copy of the user's persisted command-to-chord overrides.
func (s *ConfigService) GetHotkeyMappings() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	mappings := make(map[string]string, len(s.config.Hotkeys))
	for commandID, hotkey := range s.config.Hotkeys {
		mappings[commandID] = hotkey
	}
	return mappings
}

// SetHotkey validates and persists a user override for an implemented command.
func (s *ConfigService) SetHotkey(commandID, chord string) error {
	command, ok := models.FindCommandDescriptor(commandID)
	if !ok {
		return fmt.Errorf("unknown command: %q", commandID)
	}
	canonicalChord, err := models.NormalizeHotkeyChord(chord)
	if err != nil {
		return err
	}
	return s.updateConfig(func(cfg *models.Config) error {
		for _, existing := range commandDescriptorsForConfig(cfg) {
			if existing.ID == command.ID || existing.Scope != command.Scope {
				continue
			}
			if existing.Hotkey == canonicalChord {
				return fmt.Errorf("hotkey %q conflicts with %q in %s scope", canonicalChord, existing.ID, command.Scope)
			}
		}
		if cfg.Hotkeys == nil {
			cfg.Hotkeys = make(map[string]string)
		}
		cfg.Hotkeys[commandID] = canonicalChord
		return nil
	})
}

// ClearHotkey removes a persisted override so the command uses its descriptor default again.
func (s *ConfigService) ClearHotkey(commandID string) error {
	command, ok := models.FindCommandDescriptor(commandID)
	if !ok {
		return fmt.Errorf("unknown command: %q", commandID)
	}
	return s.updateConfig(func(cfg *models.Config) error {
		delete(cfg.Hotkeys, commandID)
		return validateHotkeyConfiguration(cfg, command.Scope)
	})
}

func normalizeHotkeyOverrides(overrides map[string]string) (bool, error) {
	changed := false
	for commandID, chord := range overrides {
		if _, ok := models.FindCommandDescriptor(commandID); !ok {
			return false, fmt.Errorf("unknown command: %q", commandID)
		}
		canonical, err := models.NormalizeHotkeyChord(chord)
		if err != nil {
			return false, fmt.Errorf("hotkey %q for %q: %w", chord, commandID, err)
		}
		if canonical != chord {
			overrides[commandID] = canonical
			changed = true
		}
	}
	return changed, nil
}

func validateLoadedConfig(cfg *models.Config) error {
	if !models.IsSupportedSidebarWidth(cfg.UI.SidebarWidth) {
		return fmt.Errorf("sidebar width must be between %d and %d", models.MinSidebarWidth, models.MaxSidebarWidth)
	}
	return validateHotkeyConfiguration(cfg, "")
}

func normalizeLegacySidebarWidth(cfg *models.Config) {
	if cfg.UI.SidebarWidth == 0 {
		cfg.UI.SidebarWidth = models.DefaultSidebarWidth
	}
}

func validateHotkeyConfiguration(cfg *models.Config, scope models.CommandScope) error {
	seen := make(map[models.CommandScope]map[string]string)
	for _, command := range commandDescriptorsForConfig(cfg) {
		if scope != "" && command.Scope != scope {
			continue
		}
		if command.Hotkey == "" {
			continue
		}
		if seen[command.Scope] == nil {
			seen[command.Scope] = make(map[string]string)
		}
		if existingID, exists := seen[command.Scope][command.Hotkey]; exists {
			return fmt.Errorf("hotkey %q conflicts with %q in %s scope", command.Hotkey, existingID, command.Scope)
		}
		seen[command.Scope][command.Hotkey] = command.ID
	}
	return nil
}

func (s *ConfigService) GetFileExplorerConfig() models.FileExplorerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	config := s.config.UI.FileExplorer
	defaults := models.DefaultConfig().UI.FileExplorer
	if config.SortField == "" {
		config.SortField = defaults.SortField
	}
	if config.SortDirection == "" {
		config.SortDirection = defaults.SortDirection
	}
	return config
}

func (s *ConfigService) SetFileExplorerAutoReveal(enabled bool) error {
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.UI.FileExplorer.AutoReveal = enabled
		return nil
	})
}

func (s *ConfigService) SetFileExplorerSort(field, direction string) error {
	if field != "name" && field != "modified" && field != "created" {
		return fmt.Errorf("invalid file explorer sort field: %q", field)
	}
	if direction != "ascending" && direction != "descending" {
		return fmt.Errorf("invalid file explorer sort direction: %q", direction)
	}
	return s.updateConfig(func(cfg *models.Config) error {
		cfg.UI.FileExplorer.SortField = field
		cfg.UI.FileExplorer.SortDirection = direction
		return nil
	})
}

// GetConfigPath returns the configuration file path
func (s *ConfigService) GetConfigPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.configPath
}

// ReloadConfig reloads the configuration from file
func (s *ConfigService) ReloadConfig() error {
	return s.Load()
}

// updateConfig serializes each mutation, persists every peer, then makes the
// candidate visible to the running application.
func (s *ConfigService) updateConfig(mutate func(*models.Config) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.normalizePaths()
	candidate := s.config.Clone()
	if err := mutate(candidate); err != nil {
		return err
	}
	if err := s.persistConfigLocked(s.config, candidate, mutate); err != nil {
		return err
	}
	s.config = candidate
	return nil
}

type configWrite struct {
	path     string
	cfg      *models.Config
	document map[string]interface{}
}

type configBackup struct {
	path   string
	exists bool
	data   []byte
}

func (s *ConfigService) persistConfigLocked(before, candidate *models.Config, mutate func(*models.Config) error) error {
	activeConfig := candidate
	var activeDocument map[string]interface{}
	if s.useDevConfig {
		var err error
		activeDocument, err = readConfigOverlayDocument(s.configPath)
		if err != nil {
			return err
		}
		applyConfigChangesToDocument(activeDocument, before, candidate)
		activeConfig = nil
	}
	targets := []configWrite{{path: s.configPath, cfg: activeConfig, document: activeDocument}}
	if !s.useCustomConfig {
		for _, configPath := range s.sharedMutationTargets() {
			var peerConfig *models.Config
			var peerDocument map[string]interface{}
			var err error
			if configPath == filepath.Join(s.configDir, "config.dev.toml") {
				peerDocument, err = readConfigOverlayDocument(configPath)
			} else {
				peerConfig, err = readConfigForMutation(configPath)
			}
			if err != nil {
				return err
			}
			if configPath == filepath.Join(s.configDir, "config.dev.toml") {
				applyConfigChangesToDocument(peerDocument, before, candidate)
				peerConfig = nil
			} else if err := mutate(peerConfig); err != nil {
				return err
			}
			targets = append(targets, configWrite{path: configPath, cfg: peerConfig, document: peerDocument})
		}
	}

	return writeConfigTargetsAtomically(targets)
}

func writeConfigTargetsAtomically(targets []configWrite) error {
	backups := make([]configBackup, 0, len(targets))
	for _, target := range targets {
		backup, err := backupConfigFile(target.path)
		if err != nil {
			return err
		}
		backups = append(backups, backup)
	}

	written := 0
	for _, target := range targets {
		if err := writeConfigTarget(target); err != nil {
			if rollbackErr := restoreConfigBackups(backups[:written]); rollbackErr != nil {
				return fmt.Errorf("persist config: %w; rollback: %v", err, rollbackErr)
			}
			return err
		}
		written++
	}
	return nil
}

func readConfigForMutation(path string) (*models.Config, error) {
	cfg := models.DefaultConfig()
	if _, err := os.Stat(path); err == nil {
		if _, err := toml.DecodeFile(path, cfg); err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return cfg, nil
}

func readConfigOverlayDocument(path string) (map[string]interface{}, error) {
	document := make(map[string]interface{})
	if _, err := os.Stat(path); err == nil {
		if _, err := toml.DecodeFile(path, &document); err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return document, nil
}

func writeConfigTarget(target configWrite) error {
	if target.document != nil {
		return writeConfigDocument(target.path, target.document)
	}
	return writeConfigFile(target.path, target.cfg)
}

func backupConfigFile(path string) (configBackup, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return configBackup{path: path}, nil
	}
	if err != nil {
		return configBackup{}, err
	}
	return configBackup{path: path, exists: true, data: data}, nil
}

func restoreConfigBackups(backups []configBackup) error {
	for index := len(backups) - 1; index >= 0; index-- {
		backup := backups[index]
		if backup.exists {
			if err := writeConfigBytes(backup.path, backup.data); err != nil {
				return err
			}
			continue
		}
		if err := os.Remove(backup.path); err != nil && !os.IsNotExist(err) {
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

// mergeConfigOverlay applies only TOML leaves that were actually present in a
// development overlay. Decoding an overlay into DefaultConfig would otherwise
// turn omitted fields into default values and overwrite the shared config.
func mergeConfigOverlay(base, overlay *models.Config, metadata toml.MetaData) {
	if metadata.IsDefined("vault", "path") {
		base.Vault.Path = overlay.Vault.Path
	}
	if metadata.IsDefined("vault", "delete_mode") {
		base.Vault.DeleteMode = overlay.Vault.DeleteMode
	}
	if metadata.IsDefined("attachment", "location") {
		base.Attachment.Location = overlay.Attachment.Location
	}
	if metadata.IsDefined("attachment", "folder") {
		base.Attachment.Folder = overlay.Attachment.Folder
	}
	if metadata.IsDefined("recovery", "snapshot_interval_minutes") {
		base.Recovery.SnapshotIntervalMinutes = overlay.Recovery.SnapshotIntervalMinutes
	}
	if metadata.IsDefined("recovery", "retention_days") {
		base.Recovery.RetentionDays = overlay.Recovery.RetentionDays
	}
	if metadata.IsDefined("daily_notes", "folder") {
		base.DailyNotes.Folder = overlay.DailyNotes.Folder
	}
	if metadata.IsDefined("daily_notes", "format") {
		base.DailyNotes.Format = overlay.DailyNotes.Format
	}
	if metadata.IsDefined("daily_notes", "template") {
		base.DailyNotes.Template = overlay.DailyNotes.Template
	}
	if metadata.IsDefined("timeline", "section") {
		base.Timeline.Section = overlay.Timeline.Section
	}
	if metadata.IsDefined("timeline", "time_format") {
		base.Timeline.TimeFormat = overlay.Timeline.TimeFormat
	}
	if metadata.IsDefined("templates", "folder") {
		base.Templates.Folder = overlay.Templates.Folder
	}
	if metadata.IsDefined("editor", "font_size") {
		base.Editor.FontSize = overlay.Editor.FontSize
	}
	if metadata.IsDefined("editor", "font_family") {
		base.Editor.FontFamily = overlay.Editor.FontFamily
	}
	if metadata.IsDefined("editor", "line_numbers") {
		base.Editor.LineNumbers = overlay.Editor.LineNumbers
	}
	if metadata.IsDefined("editor", "word_wrap") {
		base.Editor.WordWrap = overlay.Editor.WordWrap
	}
	if metadata.IsDefined("ui", "theme") {
		base.UI.Theme = overlay.UI.Theme
	}
	if metadata.IsDefined("ui", "sidebar_width") {
		base.UI.SidebarWidth = overlay.UI.SidebarWidth
	}
	if metadata.IsDefined("ui", "file_explorer", "auto_reveal") {
		base.UI.FileExplorer.AutoReveal = overlay.UI.FileExplorer.AutoReveal
	}
	if metadata.IsDefined("ui", "file_explorer", "sort_field") {
		base.UI.FileExplorer.SortField = overlay.UI.FileExplorer.SortField
	}
	if metadata.IsDefined("ui", "file_explorer", "sort_direction") {
		base.UI.FileExplorer.SortDirection = overlay.UI.FileExplorer.SortDirection
	}
	if metadata.IsDefined("hotkeys") {
		if base.Hotkeys == nil {
			base.Hotkeys = make(map[string]string)
		}
		for commandID, hotkey := range overlay.Hotkeys {
			base.Hotkeys[commandID] = hotkey
		}
	}
}

// applyConfigChanges writes only leaves changed by one setter. It keeps a
// development config sparse while still allowing its explicit overrides to be
// updated independently from the shared configuration.
func applyConfigChanges(target, before, after *models.Config) {
	if before.Vault.Path != after.Vault.Path {
		target.Vault.Path = after.Vault.Path
	}
	if before.Vault.DeleteMode != after.Vault.DeleteMode {
		target.Vault.DeleteMode = after.Vault.DeleteMode
	}
	if before.Attachment.Location != after.Attachment.Location {
		target.Attachment.Location = after.Attachment.Location
	}
	if before.Attachment.Folder != after.Attachment.Folder {
		target.Attachment.Folder = after.Attachment.Folder
	}
	if before.Recovery.SnapshotIntervalMinutes != after.Recovery.SnapshotIntervalMinutes {
		target.Recovery.SnapshotIntervalMinutes = after.Recovery.SnapshotIntervalMinutes
	}
	if before.Recovery.RetentionDays != after.Recovery.RetentionDays {
		target.Recovery.RetentionDays = after.Recovery.RetentionDays
	}
	if before.DailyNotes.Folder != after.DailyNotes.Folder {
		target.DailyNotes.Folder = after.DailyNotes.Folder
	}
	if before.DailyNotes.Format != after.DailyNotes.Format {
		target.DailyNotes.Format = after.DailyNotes.Format
	}
	if before.DailyNotes.Template != after.DailyNotes.Template {
		target.DailyNotes.Template = after.DailyNotes.Template
	}
	if before.Timeline.Section != after.Timeline.Section {
		target.Timeline.Section = after.Timeline.Section
	}
	if before.Timeline.TimeFormat != after.Timeline.TimeFormat {
		target.Timeline.TimeFormat = after.Timeline.TimeFormat
	}
	if before.Templates.Folder != after.Templates.Folder {
		target.Templates.Folder = after.Templates.Folder
	}
	if before.Editor.FontSize != after.Editor.FontSize {
		target.Editor.FontSize = after.Editor.FontSize
	}
	if before.Editor.FontFamily != after.Editor.FontFamily {
		target.Editor.FontFamily = after.Editor.FontFamily
	}
	if before.Editor.LineNumbers != after.Editor.LineNumbers {
		target.Editor.LineNumbers = after.Editor.LineNumbers
	}
	if before.Editor.WordWrap != after.Editor.WordWrap {
		target.Editor.WordWrap = after.Editor.WordWrap
	}
	if before.UI.Theme != after.UI.Theme {
		target.UI.Theme = after.UI.Theme
	}
	if before.UI.SidebarWidth != after.UI.SidebarWidth {
		target.UI.SidebarWidth = after.UI.SidebarWidth
	}
	if before.UI.FileExplorer.AutoReveal != after.UI.FileExplorer.AutoReveal {
		target.UI.FileExplorer.AutoReveal = after.UI.FileExplorer.AutoReveal
	}
	if before.UI.FileExplorer.SortField != after.UI.FileExplorer.SortField {
		target.UI.FileExplorer.SortField = after.UI.FileExplorer.SortField
	}
	if before.UI.FileExplorer.SortDirection != after.UI.FileExplorer.SortDirection {
		target.UI.FileExplorer.SortDirection = after.UI.FileExplorer.SortDirection
	}
	hotkeysChanged := false
	for commandID, hotkey := range after.Hotkeys {
		if before.Hotkeys[commandID] != hotkey {
			hotkeysChanged = true
			break
		}
	}
	if !hotkeysChanged {
		for commandID := range before.Hotkeys {
			if _, exists := after.Hotkeys[commandID]; !exists {
				hotkeysChanged = true
				break
			}
		}
	}
	if !hotkeysChanged {
		return
	}
	if target.Hotkeys == nil {
		target.Hotkeys = make(map[string]string)
	}
	for commandID, hotkey := range after.Hotkeys {
		if before.Hotkeys[commandID] != hotkey {
			target.Hotkeys[commandID] = hotkey
		}
	}
	for commandID := range before.Hotkeys {
		if _, exists := after.Hotkeys[commandID]; !exists {
			delete(target.Hotkeys, commandID)
		}
	}
}

func applyConfigChangesToDocument(document map[string]interface{}, before, after *models.Config) {
	if before.Vault.Path != after.Vault.Path {
		setConfigDocumentLeaf(document, []string{"vault", "path"}, after.Vault.Path)
	}
	if before.Vault.DeleteMode != after.Vault.DeleteMode {
		setConfigDocumentLeaf(document, []string{"vault", "delete_mode"}, string(after.Vault.DeleteMode))
	}
	if before.Attachment.Location != after.Attachment.Location {
		setConfigDocumentLeaf(document, []string{"attachment", "location"}, string(after.Attachment.Location))
	}
	if before.Attachment.Folder != after.Attachment.Folder {
		setConfigDocumentLeaf(document, []string{"attachment", "folder"}, after.Attachment.Folder)
	}
	if before.Recovery.SnapshotIntervalMinutes != after.Recovery.SnapshotIntervalMinutes {
		setConfigDocumentLeaf(document, []string{"recovery", "snapshot_interval_minutes"}, after.Recovery.SnapshotIntervalMinutes)
	}
	if before.Recovery.RetentionDays != after.Recovery.RetentionDays {
		setConfigDocumentLeaf(document, []string{"recovery", "retention_days"}, after.Recovery.RetentionDays)
	}
	if before.DailyNotes.Folder != after.DailyNotes.Folder {
		setConfigDocumentLeaf(document, []string{"daily_notes", "folder"}, after.DailyNotes.Folder)
	}
	if before.DailyNotes.Format != after.DailyNotes.Format {
		setConfigDocumentLeaf(document, []string{"daily_notes", "format"}, after.DailyNotes.Format)
	}
	if before.DailyNotes.Template != after.DailyNotes.Template {
		setConfigDocumentLeaf(document, []string{"daily_notes", "template"}, after.DailyNotes.Template)
	}
	if before.Timeline.Section != after.Timeline.Section {
		setConfigDocumentLeaf(document, []string{"timeline", "section"}, after.Timeline.Section)
	}
	if before.Timeline.TimeFormat != after.Timeline.TimeFormat {
		setConfigDocumentLeaf(document, []string{"timeline", "time_format"}, after.Timeline.TimeFormat)
	}
	if before.Templates.Folder != after.Templates.Folder {
		setConfigDocumentLeaf(document, []string{"templates", "folder"}, after.Templates.Folder)
	}
	if before.Editor.FontSize != after.Editor.FontSize {
		setConfigDocumentLeaf(document, []string{"editor", "font_size"}, after.Editor.FontSize)
	}
	if before.Editor.FontFamily != after.Editor.FontFamily {
		setConfigDocumentLeaf(document, []string{"editor", "font_family"}, after.Editor.FontFamily)
	}
	if before.Editor.LineNumbers != after.Editor.LineNumbers {
		setConfigDocumentLeaf(document, []string{"editor", "line_numbers"}, after.Editor.LineNumbers)
	}
	if before.Editor.WordWrap != after.Editor.WordWrap {
		setConfigDocumentLeaf(document, []string{"editor", "word_wrap"}, after.Editor.WordWrap)
	}
	if before.UI.Theme != after.UI.Theme {
		setConfigDocumentLeaf(document, []string{"ui", "theme"}, after.UI.Theme)
	}
	if before.UI.SidebarWidth != after.UI.SidebarWidth {
		setConfigDocumentLeaf(document, []string{"ui", "sidebar_width"}, after.UI.SidebarWidth)
	}
	if before.UI.FileExplorer.AutoReveal != after.UI.FileExplorer.AutoReveal {
		setConfigDocumentLeaf(document, []string{"ui", "file_explorer", "auto_reveal"}, after.UI.FileExplorer.AutoReveal)
	}
	if before.UI.FileExplorer.SortField != after.UI.FileExplorer.SortField {
		setConfigDocumentLeaf(document, []string{"ui", "file_explorer", "sort_field"}, after.UI.FileExplorer.SortField)
	}
	if before.UI.FileExplorer.SortDirection != after.UI.FileExplorer.SortDirection {
		setConfigDocumentLeaf(document, []string{"ui", "file_explorer", "sort_direction"}, after.UI.FileExplorer.SortDirection)
	}
	for commandID, hotkey := range after.Hotkeys {
		if before.Hotkeys[commandID] != hotkey {
			setConfigDocumentLeaf(document, []string{"hotkeys", commandID}, hotkey)
		}
	}
	for commandID := range before.Hotkeys {
		if _, exists := after.Hotkeys[commandID]; !exists {
			deleteConfigDocumentLeaf(document, []string{"hotkeys", commandID})
		}
	}
}

func setConfigDocumentLeaf(document map[string]interface{}, path []string, value interface{}) {
	table := document
	for _, key := range path[:len(path)-1] {
		next, ok := table[key].(map[string]interface{})
		if !ok {
			next = make(map[string]interface{})
			table[key] = next
		}
		table = next
	}
	table[path[len(path)-1]] = value
}

func deleteConfigDocumentLeaf(document map[string]interface{}, path []string) {
	table := document
	for _, key := range path[:len(path)-1] {
		next, ok := table[key].(map[string]interface{})
		if !ok {
			return
		}
		table = next
	}
	delete(table, path[len(path)-1])
}

func writeConfigFile(path string, cfg *models.Config) error {
	return writeConfigValue(path, cfg)
}

func writeConfigDocument(path string, document map[string]interface{}) error {
	return writeConfigValue(path, document)
}

func writeConfigValue(path string, value interface{}) error {
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

	if err := toml.NewEncoder(tempFile).Encode(value); err != nil {
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

func writeConfigBytes(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	tempFile, err := os.CreateTemp(filepath.Dir(path), "obails-config-rollback-*.toml")
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
	if _, err := tempFile.Write(data); err != nil {
		_ = tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("restore config file: %w", err)
	}
	success = true
	return nil
}
