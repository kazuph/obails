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

/**
 * Determines if a theme is dark based on its identifier
 */
export function isDarkTheme(theme: string): boolean {
  return !LIGHT_THEMES.includes(theme as LightTheme);
}
