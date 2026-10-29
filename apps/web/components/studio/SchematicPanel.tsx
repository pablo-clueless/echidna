"use client";

import { useTranslations } from "next-intl";
import { Spline } from "lucide-react";

import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

export const SchematicPanel = () => {
  const t = useTranslations("Studio.schematic");

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <PanelHeader title={t("title")} />
      <PanelEmpty icon={<Spline />} title={t("emptyTitle")} description={t("emptyDescription")} />
    </section>
  );
};
