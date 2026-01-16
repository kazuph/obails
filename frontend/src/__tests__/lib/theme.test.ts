import { describe, it, expect } from "vitest";
import { LIGHT_THEMES, isDarkTheme } from "../../lib/theme";

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
  });

  it("should return true for unknown themes (default to dark)", () => {
    expect(isDarkTheme("unknown-theme")).toBe(true);
    expect(isDarkTheme("")).toBe(true);
  });
});
