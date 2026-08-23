package main

import (
	"bytes"
	"image/png"
	"reflect"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestApplicationIconIsA1024PixelPNG(t *testing.T) {
	image, err := png.Decode(bytes.NewReader(appIcon))
	if err != nil {
		t.Fatalf("decode app icon: %v", err)
	}
	if bounds := image.Bounds(); bounds.Dx() != 1024 || bounds.Dy() != 1024 {
		t.Fatalf("app icon bounds = %v, want 1024x1024", bounds)
	}
}

func TestNormalizeThemeValue(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"dark", "catppuccin"},
		{"GitHub Dark", "catppuccin"},
		{"light", "github-light"},
		{"Tokyo Night", "tokyonight"},
		{"liquid-glass", "liquid-glass-dark"},
		{"Liquid Glass", "liquid-glass-dark"},
		{"glass", "liquid-glass-dark"},
		{"glass-light", "liquid-glass-light"},
		{"Liquid Glass Light", "liquid-glass-light"},
		{"liquid-glass-dark", "liquid-glass-dark"},
		{"  Rose Pine Dawn  ", "rosepine-dawn"},
	}

	for _, c := range cases {
		if got := normalizeThemeValue(c.input); got != c.want {
			t.Errorf("normalizeThemeValue(%q) = %q, want %q", c.input, got, c.want)
		}
	}
}

func TestMacBackdropForTheme(t *testing.T) {
	t.Run("non-glass themes keep translucent backdrop", func(t *testing.T) {
		for _, theme := range []string{"github-light", "tokyonight", "dark", "", "unknown"} {
			backdrop, _ := macBackdropForTheme(theme)
			if backdrop != application.MacBackdropTranslucent {
				t.Errorf("macBackdropForTheme(%q) backdrop = %v, want MacBackdropTranslucent", theme, backdrop)
			}
		}
	})

	t.Run("liquid glass dark uses native liquid glass with dark style", func(t *testing.T) {
		backdrop, glass := macBackdropForTheme("liquid-glass-dark")
		if backdrop != application.MacBackdropLiquidGlass {
			t.Errorf("backdrop = %v, want MacBackdropLiquidGlass", backdrop)
		}
		if glass.Style != application.LiquidGlassStyleDark {
			t.Errorf("style = %v, want LiquidGlassStyleDark", glass.Style)
		}
	})

	t.Run("liquid glass light uses native liquid glass with light style", func(t *testing.T) {
		backdrop, glass := macBackdropForTheme("liquid-glass-light")
		if backdrop != application.MacBackdropLiquidGlass {
			t.Errorf("backdrop = %v, want MacBackdropLiquidGlass", backdrop)
		}
		if glass.Style != application.LiquidGlassStyleLight {
			t.Errorf("style = %v, want LiquidGlassStyleLight", glass.Style)
		}
	})

	t.Run("aliases resolve before backdrop selection", func(t *testing.T) {
		backdrop, glass := macBackdropForTheme("Liquid Glass")
		if backdrop != application.MacBackdropLiquidGlass || glass.Style != application.LiquidGlassStyleDark {
			t.Errorf("alias 'Liquid Glass' = (%v, %v), want (MacBackdropLiquidGlass, LiquidGlassStyleDark)", backdrop, glass.Style)
		}
	})

	t.Run("theme menu offers both glass themes", func(t *testing.T) {
		found := map[string]bool{}
		for _, option := range themeMenuOptions {
			if option.Group == "Glass" {
				found[option.Value] = true
			}
		}
		if !found["liquid-glass-light"] || !found["liquid-glass-dark"] {
			t.Errorf("themeMenuOptions Glass group = %v, want liquid-glass-light and liquid-glass-dark", found)
		}
	})
}

func TestWorkspaceApplicationMenuExposesNamedWorkspaceActions(t *testing.T) {
	menu := application.NewMenu()
	appendWorkspaceMenu(menu, nil, []string{"Writing", "Research"}, "Writing")
	workspace := menu.FindByLabel("Workspace")
	if workspace == nil || workspace.GetSubmenu() == nil {
		t.Fatal("expected a Workspace submenu")
	}
	items := workspace.GetSubmenu()
	saveAs := items.FindByLabel("Save Current Workspace As…")
	saveCurrent := items.FindByLabel("Save Current Workspace")
	open := items.FindByLabel("Open Workspace")
	manage := items.FindByLabel("Manage Workspaces…")
	if saveAs == nil || saveCurrent == nil || open == nil || manage == nil {
		t.Fatalf("workspace menu items missing: saveAs=%v saveCurrent=%v open=%v manage=%v", saveAs, saveCurrent, open, manage)
	}
	if !saveCurrent.Enabled() {
		t.Fatal("Save Current Workspace should be enabled when a named workspace is selected")
	}
	openItems := open.GetSubmenu()
	if openItems == nil || openItems.FindByLabel("Writing") == nil || openItems.FindByLabel("Research") == nil {
		t.Fatal("Open Workspace submenu should list saved names")
	}
	if item := openItems.FindByLabel("Writing"); item == nil || !item.Checked() {
		t.Fatal("selected named workspace should be marked in Open Workspace")
	}

	empty := application.NewMenu()
	appendWorkspaceMenu(empty, nil, nil, "")
	emptyWorkspace := empty.FindByLabel("Workspace")
	if emptyWorkspace == nil || emptyWorkspace.GetSubmenu() == nil {
		t.Fatal("expected an empty Workspace submenu")
	}
	emptyItems := emptyWorkspace.GetSubmenu()
	if emptyItems.FindByLabel("Save Current Workspace").Enabled() {
		t.Fatal("Save Current Workspace should be disabled without a selected named workspace")
	}
	placeholder := emptyItems.FindByLabel("Open Workspace").GetSubmenu().FindByLabel("No saved workspaces")
	if placeholder == nil || placeholder.Enabled() {
		t.Fatal("empty Open Workspace submenu should show a disabled placeholder")
	}
}

func TestBuildApplicationMenuIncludesWorkspaceAndSelectedTheme(t *testing.T) {
	app := application.Get()
	if app == nil {
		app = application.New(application.Options{DisableDefaultSignalHandler: true})
	}
	menu := buildApplicationMenu(app, "nord", []string{"Writing"}, "Writing", nil, nil)
	workspace := menu.FindByLabel("Workspace")
	if workspace == nil || workspace.GetSubmenu() == nil {
		t.Fatal("expected a Workspace submenu on the application menu")
	}
	theme := menu.FindByLabel("Theme")
	if theme == nil || theme.GetSubmenu() == nil {
		t.Fatal("expected a Theme submenu on the application menu")
	}
	nord := theme.GetSubmenu().FindByLabel("Nord")
	if nord == nil || !nord.Checked() {
		t.Fatal("selected theme should be checked")
	}
	github := theme.GetSubmenu().FindByLabel("GitHub Light")
	if github == nil || github.Checked() {
		t.Fatal("unselected theme should not be checked")
	}
	open := workspace.GetSubmenu().FindByLabel("Open Workspace")
	if open == nil || open.GetSubmenu() == nil || open.GetSubmenu().FindByLabel("Writing") == nil {
		t.Fatal("Workspace menu should list the saved name used at refresh")
	}
}

func TestApplicationVersionIs110(t *testing.T) {
	if applicationVersion != "1.1.0" {
		t.Fatalf("applicationVersion = %q, want 1.1.0", applicationVersion)
	}
	if applicationMenuMainThreadFixMarker != "obails-v1.0.1-setApplicationMenu-main-thread" {
		t.Fatalf("crash-fix marker = %q", applicationMenuMainThreadFixMarker)
	}
}

func TestApplicationMenuRuntimeDispatcherIsWailsInvokeSync(t *testing.T) {
	if reflect.ValueOf(applicationMenuRuntimeDispatcher).Pointer() != reflect.ValueOf(application.InvokeSync).Pointer() {
		t.Fatal("runtime SetApplicationMenu dispatch must use application.InvokeSync")
	}
}

func TestWindowVisualsFollowTheSelectedTheme(t *testing.T) {
	for _, theme := range []string{"github-light", "solarized-light", "one-light", "catppuccin-latte", "rosepine-dawn", "liquid-glass-light"} {
		visuals := windowVisualsForTheme(theme)
		if visuals.Title != applicationName {
			t.Errorf("windowVisualsForTheme(%q) title = %q, want %q", theme, visuals.Title, applicationName)
		}
		if visuals.Mac.Appearance != application.NSAppearanceNameAqua {
			t.Errorf("windowVisualsForTheme(%q) appearance = %q, want Aqua", theme, visuals.Mac.Appearance)
		}
		if visuals.BackgroundColour != application.NewRGB(255, 255, 255) {
			t.Errorf("windowVisualsForTheme(%q) background = %#v, want white", theme, visuals.BackgroundColour)
		}
	}

	for _, theme := range []string{"catppuccin", "dracula", "nord", "solarized", "onedark", "gruvbox", "tokyonight", "liquid-glass-dark"} {
		visuals := windowVisualsForTheme(theme)
		if visuals.Mac.Appearance != application.NSAppearanceNameDarkAqua {
			t.Errorf("windowVisualsForTheme(%q) appearance = %q, want DarkAqua", theme, visuals.Mac.Appearance)
		}
		if visuals.BackgroundColour != application.NewRGB(27, 38, 54) {
			t.Errorf("windowVisualsForTheme(%q) background = %#v, want dark chrome", theme, visuals.BackgroundColour)
		}
	}
}
