/**
 * List of light theme identifiers
 */
export const LIGHT_THEMES = [
  "github-light",
  "solarized-light",
  "one-light",
  "catppuccin-latte",
  "rosepine-dawn",
] as const;

export type LightTheme = (typeof LIGHT_THEMES)[number];

export const DEFAULT_THEME = "github-light";

/**
 * Determines if a theme is dark based on its identifier
 */
export function isDarkTheme(theme: string): boolean {
  return !LIGHT_THEMES.includes(normalizeThemeValue(theme) as LightTheme);
}

export function normalizeThemeValue(theme: string | undefined | null): string {
  const normalized = (theme || "").trim().toLowerCase().replace(/\s+/g, "-");

  if (["dark", "github-dark", "catppuccin-mocha"].includes(normalized)) {
    return "catppuccin";
  }

  if (["light", "github-light"].includes(normalized)) {
    return "github-light";
  }

  if (["solarized-dark", "solarized"].includes(normalized)) {
    return "solarized";
  }

  if (["one-dark", "onedark"].includes(normalized)) {
    return "onedark";
  }

  if (["rose-pine-dawn", "rosepine-dawn"].includes(normalized)) {
    return "rosepine-dawn";
  }

  if (["tokyo-night", "tokyonight"].includes(normalized)) {
    return "tokyonight";
  }

  return normalized;
}

export function resolveThemeSelection(
  validThemes: readonly string[],
  configTheme: string | undefined | null,
  storedTheme: string | undefined | null,
  fallbackTheme = DEFAULT_THEME
): string {
  const normalizedConfigTheme = normalizeThemeValue(configTheme);
  if (validThemes.includes(normalizedConfigTheme)) {
    return normalizedConfigTheme;
  }

  const normalizedStoredTheme = normalizeThemeValue(storedTheme);
  if (validThemes.includes(normalizedStoredTheme)) {
    return normalizedStoredTheme;
  }

  return validThemes.includes(fallbackTheme) ? fallbackTheme : validThemes[0] || DEFAULT_THEME;
}

export function getAppliedTheme(): string {
  const documentTheme =
    typeof document === "undefined"
      ? ""
      : normalizeThemeValue(document.documentElement.getAttribute("data-theme"));
  if (documentTheme) {
    return documentTheme;
  }

  const storedTheme =
    typeof localStorage === "undefined"
      ? ""
      : normalizeThemeValue(localStorage.getItem("obails-theme"));
  return storedTheme || DEFAULT_THEME;
}
