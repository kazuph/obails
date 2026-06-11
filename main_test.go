package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

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
