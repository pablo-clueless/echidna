"use client";

import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";

import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { useStudioStore } from "@/stores/studio";
import { PanelHeader } from "./PanelHeader";
import { PanelEmpty } from "./PanelEmpty";

export const InspectorPanel = () => {
  const t = useTranslations("Studio.inspector");
  const selected = useStudioStore((s) => s.selectedComponentId);

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <PanelHeader title={t("title")} />
      {selected ? (
        <div className="flex-1 overflow-auto p-2">
          <Item variant="muted" size="sm">
            <ItemContent>
              <ItemTitle className="font-mono">{t("selected", { id: selected })}</ItemTitle>
            </ItemContent>
          </Item>
        </div>
      ) : (
        <PanelEmpty icon={<MousePointerClick />} title={t("emptyTitle")} description={t("emptyDescription")} />
      )}
    </section>
  );
};
