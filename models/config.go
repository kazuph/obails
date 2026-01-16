package models

// Config represents the application configuration
type Config struct {
	Vault      VaultConfig      `toml:"vault"`
	DailyNotes DailyNotesConfig `toml:"daily_notes"`
	Thino      ThinoConfig      `toml:"thino"`
	Templates  TemplatesConfig  `toml:"templates"`
	Editor     EditorConfig     `toml:"editor"`
	UI         UIConfig         `toml:"ui"`
}

type VaultConfig struct {
	Path string `toml:"path"`
}

type DailyNotesConfig struct {
	Folder   string `toml:"folder"`
	Format   string `toml:"format"`
	Template string `toml:"template"`
}

type ThinoConfig struct {
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
	Theme        string `toml:"theme"`
	SidebarWidth int    `toml:"sidebar_width"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		Vault: VaultConfig{
			Path: "",
		},
		DailyNotes: DailyNotesConfig{
			Folder:   "02_dailynotes",
			Format:   "2006-01-02",
			Template: "daily_note",
		},
		Thino: ThinoConfig{
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
			SidebarWidth: 250,
		},
	}
}
