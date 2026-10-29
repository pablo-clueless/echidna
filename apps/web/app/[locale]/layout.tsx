import "@echidna/ui-tokens/tokens.css";
import "../globals.css";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { PersistedStores } from "@/components/app/PersistedStores";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeSync } from "@/components/app/ThemeSync";
import { htmlLang, routing } from "@/i18n/routing";
import { themeBootScript } from "@/lib/theme";
import { fontClassNames } from "../fonts";

type Props = {
  children: ReactNode;
};

export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }));

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("Metadata");
  return {
    title: { default: "Echidna", template: "%s · Echidna" },
    description: t("description"),
  };
};

export default async function LocaleLayout({ children }: Props) {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={htmlLang[locale]} className={fontClassNames(locale)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider>
          <PersistedStores />
          <ThemeSync />
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
