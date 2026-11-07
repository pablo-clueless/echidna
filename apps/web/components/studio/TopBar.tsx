"use client";

import { CircuitBoard, Download, PanelLeft, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { partsById } from "@echidna/library";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LocaleSelect } from "@/components/app/LocaleSelect";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { usePreferencesStore } from "@/stores/preferences";
import { IconButton } from "@/components/app/IconButton";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/stores/project";
import { fabricationZip } from "@/lib/fabrication";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { partKey } from "@/lib/messageKeys";
import { Link } from "@/i18n/navigation";

/** How long the note about unrouted connections stays after an export, in milliseconds. */
const NOTICE_MS = 10_000;

/** A file name made from the project's name: lower case, words joined by hyphens. */
const fileBase = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "echidna";

/** Hands the browser a file to save. */
const saveFile = (bytes: Uint8Array, name: string) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Give the download a moment to start before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

type Props = {
  libraryOpen?: boolean;
  onToggleLibrary?: () => void;
};

export const TopBar = ({ libraryOpen, onToggleLibrary }: Props) => {
  const t = useTranslations("Studio");
  const learnMode = usePreferencesStore((s) => s.learnMode);
  const setLearnMode = usePreferencesStore((s) => s.setLearnMode);
  const learnId = useId();
  const simulating = useStudioStore((s) => s.simulating);
  const setSimulating = useStudioStore((s) => s.setSimulating);
  const tParts = useTranslations("Parts");
  const onPcb = useProjectStore((s) => s.foundation === "pcb");
  const hasParts = useProjectStore((s) =>
    s.components.some((c) => partsById.get(c.specId)?.footprintId),
  );
  const [unrouted, setUnrouted] = useState(0);
  useEffect(() => {
    if (unrouted === 0) return;
    const timer = setTimeout(() => setUnrouted(0), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [unrouted]);
  const exportFiles = () => {
    const project = useProjectStore.getState();
    const base = fileBase(project.name);
    const { bytes, unrouted: missing } = fabricationZip(project, base);
    saveFile(bytes, `${base}-fabrication.zip`);
    setUnrouted(missing.length);
  };
  const hostSpecId = useProjectStore(
    (s) => s.components.find((c) => partsById.get(c.specId)?.host)?.specId,
  );

  return (
    <header className="bg-background flex h-12 shrink-0 items-center gap-3 border-b px-3">
      {onToggleLibrary && (
        <IconButton
          label={t("toggleLibrary")}
          onClick={onToggleLibrary}
          aria-pressed={libraryOpen ?? false}
        >
          <PanelLeft />
        </IconButton>
      )}
      <Link
        href="/"
        className="text-primary-text text-sm font-semibold tracking-tight no-underline"
      >
        Echidna
      </Link>
      <Separator orientation="vertical" className="h-5! max-sm:hidden" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium max-sm:hidden">{t("untitledProject")}</span>
        <Badge variant="outline" className="text-muted-foreground gap-1 max-md:hidden">
          <CircuitBoard />
          {hostSpecId ? tParts(`${partKey(hostSpecId)}.name`) : t("blankBoard")}
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 max-md:hidden">
          <Switch id={learnId} size="sm" checked={learnMode} onCheckedChange={setLearnMode} />
          <Label htmlFor={learnId} className="text-sm font-normal">
            {t("learnMode")}
          </Label>
        </div>
        {unrouted > 0 && (
          <span role="status" className="text-status-warn-text text-xs max-lg:hidden">
            {t("export.unrouted", { count: unrouted })}
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={exportFiles} disabled={!hasParts}>
              <Download data-icon="inline-start" />
              <span className="max-sm:sr-only">{t("export.label")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{onPcb ? t("export.pcb") : t("export.modules")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={simulating ? "default" : "outline"}
              aria-pressed={simulating}
              onClick={() => setSimulating(!simulating)}
              className="max-md:hidden"
            >
              <Play data-icon="inline-start" />
              {t("simulate")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{simulating ? t("simulateOn") : t("simulateOff")}</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="h-5! max-md:hidden" />
        <div className="flex items-center gap-1">
          <LocaleSelect />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
