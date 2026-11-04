import { Noto_Sans_JP, Noto_Sans_SC } from "next/font/google";
import localFont from "next/font/local";

import type { AppLocale } from "@/i18n/routing";

const firaSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fira-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Fira Sans' Cyrillic glyphs, attached only for Russian so other locales never download them. */
const firaSansCyrillic = localFont({
  src: [
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-500-italic.woff2", weight: "500", style: "italic" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-cyrillic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fira-sans-cyrillic",
  display: "swap",
  preload: false,
});

const firaCode = localFont({
  src: "../node_modules/@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2",
  weight: "300 700",
  style: "normal",
  variable: "--font-fira-code",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

const notoSansSc = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: false,
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

const scriptFonts: Partial<Record<AppLocale, string>> = {
  ru: firaSansCyrillic.variable,
  zh: notoSansSc.variable,
  ja: notoSansJp.variable,
};

/**
 * Returns the font variable classes for a locale. Latin and Cyrillic fonts are self-hosted so dev and CI never
 * depend on the network; CJK fonts come from Google with unicode-range splitting and attach only for their locale.
 * @param locale - The active locale.
 * @returns Space-separated class names for the `<html>` element.
 */
export const fontClassNames = (locale: AppLocale): string =>
  [firaSans.variable, firaCode.variable, scriptFonts[locale]].filter(Boolean).join(" ");
