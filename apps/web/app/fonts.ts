import { Noto_Sans_JP, Noto_Sans_SC } from "next/font/google";
import localFont from "next/font/local";

import type { AppLocale } from "@/i18n/routing";

const dmSans = localFont({
  src: "../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  style: "normal",
  variable: "--font-dm-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const dmMono = localFont({
  src: [
    { path: "../node_modules/@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

const notoSans = localFont({
  src: "../node_modules/@fontsource-variable/noto-sans/files/noto-sans-cyrillic-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-noto-sans",
  display: "swap",
  preload: false,
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
  ru: notoSans.variable,
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
  [dmSans.variable, dmMono.variable, scriptFonts[locale]].filter(Boolean).join(" ");
