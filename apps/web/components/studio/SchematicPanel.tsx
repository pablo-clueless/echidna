"use client";

import { RotateCw, Spline, Trash2 } from "lucide-react";
import { builds, parts } from "@echidna/library";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

import { IconButton } from "@/components/app/IconButton";
import { buildKey, partKey } from "@/lib/messageKeys";
import { EmptyContent } from "@/components/ui/empty";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "./PanelHeader";
import { Kbd } from "@/components/ui/kbd";
import { PanelEmpty } from "./PanelEmpty";

const SchematicCanvas = dynamic(
  () => import("./schematic/SchematicCanvas").then((m) => m.SchematicCanvas),
  {
    ssr: false,
  },
);

/** Dev boards a project can start from. */
const hosts = parts.filter((p) => p.host && p.kind === "devBoard");

/** The kinds of device with ready-made builds, in the order they are offered. */
const BUILD_GROUPS = ["desktop", "laptop", "drone", "smartphone", "wearable"] as const;

export const SchematicPanel = () => {
  const t = useTranslations("Studio.schematic");
  const tParts = useTranslations("Parts");
  const hasParts = useProjectStore((s) => s.components.length > 0);
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const tBuilds = useTranslations("Builds");
  const { loadExample, loadPreset, loadBuild, rotateComponent, removeComponent, removeWire } =
    useProjectStore.getState();

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
          <p className="text-muted-foreground pointer-events-none absolute bottom-2 left-3 flex items-center gap-1.5 text-xs max-md:hidden">
            {t.rich("hint", { key: (chunks) => <Kbd>{chunks}</Kbd> })}
          </p>
        </div>
      ) : (
        <PanelEmpty icon={<Spline />} title={t("emptyTitle")} description={t("emptyDescription")}>
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={loadExample}>
              {t("openExample")}
            </Button>
            <div className="flex flex-wrap justify-center gap-1.5">
              {hosts.map((host) => (
                <Button key={host.id} size="xs" variant="ghost" onClick={() => loadPreset(host.id)}>
                  {t("startFromBoard", { board: tParts(`${partKey(host.id)}.name`) })}
                </Button>
              ))}
            </div>
            {/* Ready-made builds, a group per kind of device, so thirty-odd presets stay easy to scan. */}
            {BUILD_GROUPS.map((device) => (
              <div
                key={device}
                role="group"
                aria-label={t(`deviceTypes.${device}`)}
                className="grid gap-1"
              >
                <p className="text-muted-foreground text-xs font-medium">
                  {t(`deviceTypes.${device}`)}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {builds
                    .filter((build) => build.deviceType === device)
                    .map((build) => (
                      <Button
                        key={build.id}
                        size="xs"
                        variant="ghost"
                        onClick={() => loadBuild(build.id)}
                      >
                        {t("startFromBoard", { board: tBuilds(`${buildKey(build.id)}.name`) })}
                      </Button>
                    ))}
                </div>
              </div>
            ))}
          </EmptyContent>
        </PanelEmpty>
      )}
    </section>
  );
};
