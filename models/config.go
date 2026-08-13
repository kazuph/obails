package models

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Config represents the application configuration
type Config struct {
	Vault      VaultConfig        `toml:"vault"`
	Attachment AttachmentConfig   `toml:"attachment"`
	Recovery   FileRecoveryConfig `toml:"recovery"`
	DailyNotes DailyNotesConfig   `toml:"daily_notes"`
	Timeline   TimelineConfig     `toml:"timeline"`
	Templates  TemplatesConfig    `toml:"templates"`
	Editor     EditorConfig       `toml:"editor"`
	UI         UIConfig           `toml:"ui"`
	Hotkeys    map[string]string  `toml:"hotkeys"`
}

// Clone returns an independent configuration snapshot for a persist-then-swap update.
func (c *Config) Clone() *Config {
	if c == nil {
		return DefaultConfig()
	}
	clone := *c
	if c.Hotkeys != nil {
		clone.Hotkeys = make(map[string]string, len(c.Hotkeys))
		for commandID, hotkey := range c.Hotkeys {
			clone.Hotkeys[commandID] = hotkey
		}
	}
	return &clone
}

type VaultConfig struct {
	Path       string     `toml:"path"`
	DeleteMode DeleteMode `toml:"delete_mode"`
}

// DeleteMode defines where a user-requested deletion is sent.
type DeleteMode string

const (
	DeleteModeSystemTrash DeleteMode = "system_trash"
	DeleteModeVaultTrash  DeleteMode = "vault_trash"
	DeleteModePermanent   DeleteMode = "permanent"
)

func (m DeleteMode) IsValid() bool {
	switch m {
	case DeleteModeSystemTrash, DeleteModeVaultTrash, DeleteModePermanent:
		return true
	default:
		return false
	}
}

type DailyNotesConfig struct {
	Folder   string `toml:"folder"`
	Format   string `toml:"format"`
	Template string `toml:"template"`
}

type TimelineConfig struct {
	Section    string `toml:"section"`
	TimeFormat string `toml:"time_format"`
}

type TemplatesConfig struct {
	Folder string `toml:"folder"`
}

type EditorConfig struct {
	FontSize    int    `toml:"font_size"`
	FontFamily  string `toml:"font_family"`
	LineNumbers bool   `toml:"line_numbers"`
	WordWrap    bool   `toml:"word_wrap"`
}

type UIConfig struct {
	Theme        string             `toml:"theme"`
	SidebarWidth int                `toml:"sidebar_width"`
	FileExplorer FileExplorerConfig `toml:"file_explorer"`
}

// Sidebar width bounds match the existing File Explorer resize constraints.
const (
	MinSidebarWidth     = 150
	MaxSidebarWidth     = 500
	DefaultSidebarWidth = 250
)

func IsSupportedSidebarWidth(width int) bool {
	return width >= MinSidebarWidth && width <= MaxSidebarWidth
}

// FileExplorerConfig controls presentation only; file contents and paths are unaffected.
type FileExplorerConfig struct {
	AutoReveal    bool   `toml:"auto_reveal"`
	SortField     string `toml:"sort_field"`
	SortDirection string `toml:"sort_direction"`
}

// CommandScope identifies the context in which a command can receive a key chord.
type CommandScope string

const (
	CommandScopeGlobal CommandScope = "global"
	CommandScopeNote   CommandScope = "note"
)

const (
	CommandNewNote              = "new-note"
	CommandQuickSwitcher        = "quick-switcher"
	CommandPalette              = "command-palette"
	CommandFindInNote           = "find-in-note"
	CommandSearchVault          = "search-vault"
	CommandSaveCurrentFile      = "save-current-file"
	CommandUndoEdit             = "undo-edit"
	CommandRedoEdit             = "redo-edit"
	CommandToggleGraphView      = "toggle-graph-view"
	CommandToggleSource         = "toggle-source-editor"
	CommandSplitPaneRight       = "split-pane-right"
	CommandSplitPaneDown        = "split-pane-down"
	CommandCloseActivePane      = "close-active-pane"
	CommandWorkspaceSaveAs      = "workspace-save-as"
	CommandWorkspaceSaveCurrent = "workspace-save-current"
	CommandWorkspaceManage      = "workspace-manage"
	CommandOpenSettings         = "open-settings"
	CommandToggleFileTree       = "toggle-file-tree-focus"
	CommandCloseOverlays        = "close-overlays"
	CommandShowShortcutHelp     = "show-shortcuts-help"
)

// CommandDescriptor is stable metadata for a command the application already implements.
// It does not execute the command; callers route execution in their own UI context.
type CommandDescriptor struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	Category      string       `json:"category"`
	Scope         CommandScope `json:"scope"`
	DefaultHotkey string       `json:"defaultHotkey"`
	Hotkey        string       `json:"hotkey"`
}

// CommandDescriptors returns descriptors for shortcuts currently implemented by the app.
func CommandDescriptors() []CommandDescriptor {
	return []CommandDescriptor{
		{ID: CommandNewNote, Title: "New Note", Category: "File", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+N", Hotkey: "Cmd+N"},
		{ID: CommandQuickSwitcher, Title: "Quick Switcher", Category: "File", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+O", Hotkey: "Cmd+O"},
		{ID: CommandPalette, Title: "Command Palette", Category: "View", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+P", Hotkey: "Cmd+P"},
		// Cmd+F is shared across scopes: note surfaces keep Find in Note; elsewhere Search Vault opens.
		{ID: CommandFindInNote, Title: "Find in Note", Category: "Search", Scope: CommandScopeNote, DefaultHotkey: "Cmd+F", Hotkey: "Cmd+F"},
		{ID: CommandSearchVault, Title: "Search Vault", Category: "Search", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+F", Hotkey: "Cmd+F"},
		{ID: CommandSaveCurrentFile, Title: "Save Current File", Category: "File", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+S", Hotkey: "Cmd+S"},
		{ID: CommandUndoEdit, Title: "Undo Edit", Category: "Edit", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+Z", Hotkey: "Cmd+Z"},
		{ID: CommandRedoEdit, Title: "Redo Edit", Category: "Edit", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+Shift+Z", Hotkey: "Cmd+Shift+Z"},
		{ID: CommandToggleGraphView, Title: "Toggle Graph View", Category: "View", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+G", Hotkey: "Cmd+G"},
		{ID: CommandToggleSource, Title: "Toggle Source Editor", Category: "View", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+E", Hotkey: "Cmd+E"},
		{ID: CommandSplitPaneRight, Title: "Split Pane Right", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandSplitPaneDown, Title: "Split Pane Down", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandCloseActivePane, Title: "Close Active Pane", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandWorkspaceSaveAs, Title: "Save Current Workspace As…", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandWorkspaceSaveCurrent, Title: "Save Current Workspace", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandWorkspaceManage, Title: "Manage Workspaces…", Category: "Workspace", Scope: CommandScopeGlobal},
		{ID: CommandOpenSettings, Title: "Open Settings", Category: "Settings", Scope: CommandScopeGlobal, DefaultHotkey: "Cmd+,", Hotkey: "Cmd+,"},
		{ID: CommandToggleFileTree, Title: "Toggle File Tree Focus", Category: "View", Scope: CommandScopeGlobal, DefaultHotkey: "Shift+Tab", Hotkey: "Shift+Tab"},
		{ID: CommandCloseOverlays, Title: "Close Overlays", Category: "View", Scope: CommandScopeGlobal, DefaultHotkey: "Escape", Hotkey: "Escape"},
		{ID: CommandShowShortcutHelp, Title: "Show Keyboard Shortcuts", Category: "Help", Scope: CommandScopeGlobal, DefaultHotkey: "?", Hotkey: "?"},
	}
}

// FindCommandDescriptor returns metadata for an implemented command.
func FindCommandDescriptor(id string) (CommandDescriptor, bool) {
	for _, command := range CommandDescriptors() {
		if command.ID == id {
			return command, true
		}
	}
	return CommandDescriptor{}, false
}

// NormalizeHotkeyChord accepts standard modifier aliases and returns a canonical chord.
func NormalizeHotkeyChord(chord string) (string, error) {
	parts := strings.Split(strings.TrimSpace(chord), "+")
	if len(parts) == 0 {
		return "", fmt.Errorf("hotkey chord is empty")
	}

	modifiers := map[string]bool{}
	key := ""
	for _, rawPart := range parts {
		part := strings.TrimSpace(rawPart)
		if part == "" {
			return "", fmt.Errorf("hotkey chord has an empty component")
		}
		switch strings.ToLower(part) {
		case "cmd", "command", "meta", "⌘":
			if modifiers["Cmd"] {
				return "", fmt.Errorf("hotkey chord repeats Cmd")
			}
			modifiers["Cmd"] = true
		case "ctrl", "control":
			if modifiers["Ctrl"] {
				return "", fmt.Errorf("hotkey chord repeats Ctrl")
			}
			modifiers["Ctrl"] = true
		case "alt", "option", "opt":
			if modifiers["Alt"] {
				return "", fmt.Errorf("hotkey chord repeats Alt")
			}
			modifiers["Alt"] = true
		case "shift":
			if modifiers["Shift"] {
				return "", fmt.Errorf("hotkey chord repeats Shift")
			}
			modifiers["Shift"] = true
		default:
			if key != "" {
				return "", fmt.Errorf("hotkey chord has more than one key")
			}
			canonicalKey, err := normalizeHotkeyKey(part)
			if err != nil {
				return "", err
			}
			key = canonicalKey
		}
	}
	if key == "" {
		return "", fmt.Errorf("hotkey chord has no key")
	}

	canonical := make([]string, 0, 5)
	for _, modifier := range []string{"Cmd", "Ctrl", "Alt", "Shift"} {
		if modifiers[modifier] {
			canonical = append(canonical, modifier)
		}
	}
	return strings.Join(append(canonical, key), "+"), nil
}

func normalizeHotkeyKey(key string) (string, error) {
	switch strings.ToLower(key) {
	case "escape", "esc":
		return "Escape", nil
	case "enter", "return":
		return "Enter", nil
	case "tab":
		return "Tab", nil
	case "space":
		return "Space", nil
	}
	if utf8.RuneCountInString(key) != 1 {
		return "", fmt.Errorf("invalid hotkey key %q", key)
	}
	r, _ := utf8.DecodeRuneInString(key)
	if unicode.IsSpace(r) || r == '+' || unicode.IsControl(r) {
		return "", fmt.Errorf("invalid hotkey key %q", key)
	}
	if unicode.IsLetter(r) {
		return string(unicode.ToUpper(r)), nil
	}
	return string(r), nil
}

// IsSupportedTheme reports whether a theme is already available in the app stylesheet.
func IsSupportedTheme(theme string) bool {
	switch theme {
	case "dark", "github-light", "solarized-light", "one-light", "catppuccin-latte", "rosepine-dawn", "catppuccin", "dracula", "nord", "solarized", "onedark", "gruvbox", "tokyonight", "liquid-glass-light", "liquid-glass-dark":
		return true
	default:
		return false
	}
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		Vault: VaultConfig{
			Path:       "",
			DeleteMode: DeleteModeSystemTrash,
		},
		Attachment: DefaultAttachmentConfig(),
		Recovery: FileRecoveryConfig{
			SnapshotIntervalMinutes: DefaultRecoverySnapshotIntervalMinutes,
			RetentionDays:           DefaultRecoveryRetentionDays,
		},
		DailyNotes: DailyNotesConfig{
			Folder:   "02_dailynotes",
			Format:   "2006-01-02",
			Template: "daily_note",
		},
		Timeline: TimelineConfig{
			Section:    "## Memos",
			TimeFormat: "15:04",
		},
		Templates: TemplatesConfig{
			Folder: "99_template",
		},
		Editor: EditorConfig{
			FontSize:    14,
			FontFamily:  "SF Mono",
			LineNumbers: true,
			WordWrap:    true,
		},
		UI: UIConfig{
			Theme:        "dark",
			SidebarWidth: DefaultSidebarWidth,
			FileExplorer: FileExplorerConfig{
				AutoReveal:    true,
				SortField:     "name",
				SortDirection: "ascending",
			},
		},
	}
}
