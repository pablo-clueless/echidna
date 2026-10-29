export type Locale = "en" | "fr" | "es" | "zh" | "ja" | "ru";

const latinSans = ['"DM Sans"'];
const systemSans = ["system-ui", "sans-serif"];

const localeSansFallbacks: Record<Locale, string[]> = {
  en: [],
  fr: [],
  es: [],
  ru: ['"Noto Sans"'],
  zh: ['"Noto Sans SC"'],
  ja: ['"Noto Sans JP"'],
};

/**
 * Builds the UI font stack for a locale: DM Sans first, then the locale's script fallback, then system fonts.
 * @param locale - The active locale.
 * @returns A CSS `font-family` value.
 */
export const sansStack = (locale: Locale): string =>
  [...latinSans, ...localeSansFallbacks[locale], ...systemSans].join(", ");

export const monoStack = ['"DM Mono"', "ui-monospace", "monospace"].join(", ");

export const fontSize = {
  xs: "0.75rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
} as const;

export const lineHeight = {
  tight: "1.25",
  normal: "1.5",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  bold: "700",
} as const;
