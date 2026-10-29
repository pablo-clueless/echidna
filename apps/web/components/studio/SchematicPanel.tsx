"use client";

import { RotateCw, Spline, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

import { IconButton } from "@/components/app/IconButton";
import { EmptyContent } from "@/components/ui/empty";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "./PanelHeader";
import { Kbd } from "@/components/ui/kbd";
import { PanelEmpty } from "./PanelEmpty";

const SchematicCanvas = dynamic(() => import("./schematic/SchematicCanvas").then((m) => m.SchematicCanvas), {
  ssr: false,
});

export const SchematicPanel = () => {
  const t = useTranslations("Studio.schematic");
  const hasParts = useProjectStore((s) => s.components.length > 0);
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const { loadExample, rotateComponent, removeComponent, removeWire } = useProjectStore.getState();

  const remove = () => {
    if (!selection) return;
    if (selection.kind === "component") removeComponent(selection.id);
    else removeWire(selection.id);
    select(null);
  };

  return (
    <section aria-label={t("title")} className="flex h-full flex-col">
      <PanelHeader title={t("title")}>
        {hasParts && (
          <div className="flex items-center gap-1">
            <IconButton
              label={t("rotate")}
              disabled={selection?.kind !== "component"}
              onClick={() => selection && rotateComponent(selection.id)}
            >
              <RotateCw />
            </IconButton>
            <IconButton label={t("delete")} disabled={!selection} onClick={remove}>
              <Trash2 />
            </IconButton>
          </div>
        )}
      </PanelHeader>
      {hasParts ? (
        <div className="relative min-h-0 flex-1">
          <SchematicCanvas />
          <p className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-1.5 text-xs text-muted-foreground max-md:hidden">
            {t.rich("hint", { key: (chunks) => <Kbd>{chunks}</Kbd> })}
          </p>
        </div>
      ) : (
        <PanelEmpty icon={<Spline />} title={t("emptyTitle")} description={t("emptyDescription")}>
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={loadExample}>
              {t("openExample")}
            </Button>
          </EmptyContent>
        </PanelEmpty>
      )}
    </section>
  );
};
