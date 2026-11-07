import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import type { Metadata } from "next";

import { StudioShell } from "@/components/studio/StudioShell";
import { shareMetadata, SITE_NAME } from "@/lib/site";
import { routing } from "@/i18n/routing";

export const generateMetadata = async (): Promise<Metadata> => {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, tMeta] = await Promise.all([getTranslations("Studio"), getTranslations("Metadata")]);
  return {
    title: t("title"),
    ...shareMetadata({
      locale,
      path: "/studio",
      title: `${t("title")} · ${SITE_NAME}`,
      description: tMeta("description"),
      imageAlt: tMeta("imageAlt"),
    }),
  };
};

const StudioPage = () => <StudioShell />;

export default StudioPage;
