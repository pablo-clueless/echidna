import { defineRouting } from "next-intl/routing";

export const locales = ["en", "fr", "es", "zh", "ja", "ru"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  zh: "中文",
  ja: "日本語",
  ru: "Русский",
};

export const htmlLang: Record<AppLocale, string> = {
  en: "en-GB",
  fr: "fr",
  es: "es",
  zh: "zh-Hans",
  ja: "ja",
  ru: "ru",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
});
