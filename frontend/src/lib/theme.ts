/**
 * List of light theme identifiers
 */
export const LIGHT_THEMES = [
  "github-light",
  "solarized-light",
  "one-light",
  "catppuccin-latte",
  "rosepine-dawn",
  "liquid-glass-light",
] as const;

export type LightTheme = (typeof LIGHT_THEMES)[number];

export const DEFAULT_THEME = "github-light";

export const THEME_OPTIONS = [
  { group: "Light", label: "GitHub Light", value: "github-light" },
  { group: "Light", label: "Solarized Light", value: "solarized-light" },
  { group: "Light", label: "One Light", value: "one-light" },
  { group: "Light", label: "Catppuccin Latte", value: "catppuccin-latte" },
  { group: "Light", label: "Rose Pine Dawn", value: "rosepine-dawn" },
  { group: "Dark", label: "Catppuccin Mocha", value: "catppuccin" },
  { group: "Dark", label: "Dracula", value: "dracula" },
  { group: "Dark", label: "Nord", value: "nord" },
  { group: "Dark", label: "Solarized Dark", value: "solarized" },
  { group: "Dark", label: "One Dark", value: "onedark" },
  { group: "Dark", label: "Gruvbox", value: "gruvbox" },
  { group: "Dark", label: "Tokyo Night", value: "tokyonight" },
  { group: "Glass", label: "Liquid Glass Light", value: "liquid-glass-light" },
  { group: "Glass", label: "Liquid Glass Dark", value: "liquid-glass-dark" },
] as const;

export const VALID_THEMES = THEME_OPTIONS.map(theme => theme.value);

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

  if (["liquid-glass", "liquidglass", "glass", "glass-dark", "liquid-glass-dark"].includes(normalized)) {
    return "liquid-glass-dark";
  }

  if (["glass-light", "liquid-glass-light"].includes(normalized)) {
    return "liquid-glass-light";
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
