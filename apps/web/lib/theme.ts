import { PREFERENCES_STORAGE_KEY, type ThemePreference } from "@/stores/preferences";

export type ResolvedTheme = "light" | "dark";

export const darkQuery = "(prefers-color-scheme: dark)";

/**
 * Resolves a preference to a concrete theme, reading the system setting for `system`.
 * @param theme - The user's preference.
 * @returns `light` or `dark`.
 */
export const resolveTheme = (theme: ThemePreference): ResolvedTheme =>
  theme === "system" ? (window.matchMedia(darkQuery).matches ? "dark" : "light") : theme;

/**
 * Writes the resolved theme to `<html data-theme>`, which drives both the tokens and Tailwind's `dark:` variant.
 * @param theme - The user's preference.
 */
export const applyTheme = (theme: ThemePreference): void => {
  document.documentElement.dataset.theme = resolveTheme(theme);
};

export const themeBootScript = `(()=>{let t;try{t=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFERENCES_STORAGE_KEY,
)})??"null")?.state?.theme}catch{}if(t!=="light"&&t!=="dark")t=matchMedia(${JSON.stringify(
  darkQuery,
)}).matches?"dark":"light";document.documentElement.dataset.theme=t})();`;
