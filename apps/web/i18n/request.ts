import { getRequestConfig } from "next-intl/server";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";

import { withFallback, type Messages } from "./messages";
import en from "../languages/en.json";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale: override }) => {
  const requested = override ?? (await rootParams.locale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages: Messages =
    locale === routing.defaultLocale
      ? en
      : withFallback(en, (await import(`../languages/${locale}.json`)).default as Messages);

  return { locale, messages };
});
