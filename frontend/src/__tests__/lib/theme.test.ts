import { beforeEach, describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  LIGHT_THEMES,
  getAppliedTheme,
  isDarkTheme,
  normalizeThemeValue,
  resolveThemeSelection,
} from "../../lib/theme";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("LIGHT_THEMES", () => {
  it("should contain all light theme identifiers", () => {
    expect(LIGHT_THEMES).toContain("github-light");
    expect(LIGHT_THEMES).toContain("solarized-light");
    expect(LIGHT_THEMES).toContain("one-light");
    expect(LIGHT_THEMES).toContain("catppuccin-latte");
    expect(LIGHT_THEMES).toContain("rosepine-dawn");
    expect(LIGHT_THEMES).toHaveLength(5);
  });
});

describe("isDarkTheme", () => {
  it("should return false for light themes", () => {
    expect(isDarkTheme("github-light")).toBe(false);
    expect(isDarkTheme("solarized-light")).toBe(false);
    expect(isDarkTheme("one-light")).toBe(false);
    expect(isDarkTheme("catppuccin-latte")).toBe(false);
    expect(isDarkTheme("rosepine-dawn")).toBe(false);
  });

  it("should return true for dark themes", () => {
    expect(isDarkTheme("github-dark")).toBe(true);
    expect(isDarkTheme("dracula")).toBe(true);
    expect(isDarkTheme("tokyo-night")).toBe(true);
    expect(isDarkTheme("catppuccin-mocha")).toBe(true);
    expect(isDarkTheme("dark")).toBe(true);
  });

  it("should return true for unknown themes (default to dark)", () => {
    expect(isDarkTheme("unknown-theme")).toBe(true);
    expect(isDarkTheme("")).toBe(true);
  });
});

describe("normalizeThemeValue", () => {
  it("should normalize legacy aliases", () => {
    expect(normalizeThemeValue("dark")).toBe("catppuccin");
    expect(normalizeThemeValue("github-dark")).toBe("catppuccin");
    expect(normalizeThemeValue("light")).toBe("github-light");
    expect(normalizeThemeValue("solarized-dark")).toBe("solarized");
    expect(normalizeThemeValue("one-dark")).toBe("onedark");
    expect(normalizeThemeValue("tokyo-night")).toBe("tokyonight");
  });

  it("should normalize spacing and casing", () => {
    expect(normalizeThemeValue("  Rose Pine Dawn  ")).toBe("rosepine-dawn");
  });
});

describe("resolveThemeSelection", () => {
  const validThemes = ["github-light", "catppuccin", "solarized", "tokyonight"];

  it("should prefer config theme when valid", () => {
    expect(resolveThemeSelection(validThemes, "dark", "github-light")).toBe("catppuccin");
  });

  it("should fallback to stored theme when config theme is invalid", () => {
    expect(resolveThemeSelection(validThemes, "missing-theme", "tokyo-night")).toBe("tokyonight");
  });

  it("should fallback to default theme when both are invalid", () => {
    expect(resolveThemeSelection(validThemes, "missing-theme", "another-missing")).toBe(DEFAULT_THEME);
  });
});

describe("getAppliedTheme", () => {
  it("should prefer the document theme", () => {
    document.documentElement.setAttribute("data-theme", "tokyonight");
    localStorage.setItem("obails-theme", "github-light");

    expect(getAppliedTheme()).toBe("tokyonight");
  });

  it("should fallback to localStorage then default", () => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("obails-theme", "dark");
    expect(getAppliedTheme()).toBe("catppuccin");

    localStorage.removeItem("obails-theme");
    expect(getAppliedTheme()).toBe(DEFAULT_THEME);
  });
});
