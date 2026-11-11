"use client";

import {
  Braces,
  CircuitBoard,
  Download,
  FileCode2,
  FileImage,
  FileText,
  FolderOpen,
  PanelLeft,
  Play,
  Sheet,
  Waypoints,
} from "lucide-react";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { partsById } from "@echidna/library";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROJECT_SCHEMA_PATH, parseProjectFile, projectJson } from "@/lib/export/projectFile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { schematicPdf, schematicSvg } from "@/lib/export/schematicImage";
import { pinoutCsv, projectPinout } from "@/lib/export/pinout";
import { LocaleSelect } from "@/components/app/LocaleSelect";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { usePreferencesStore } from "@/stores/preferences";
import { IconButton } from "@/components/app/IconButton";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/stores/project";
import { fabricationZip } from "@/lib/fabrication";
import { projectSpice } from "@/lib/export/spice";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { partKey } from "@/lib/messageKeys";
import { Link } from "@/i18n/navigation";

/** How long a note about an export or an opened file stays, in milliseconds. */
const NOTICE_MS = 10_000;

/** A file name made from the project's name: lower case, words joined by hyphens. */
const fileBase = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "echidna";

/** Hands the browser a file to save. */
const saveFile = (data: Uint8Array | string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Give the download a moment to start before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** A menu entry's name with a line saying what it holds. */
const ExportItem = ({ title, detail }: { title: string; detail: string }) => (
  <span className="grid gap-0.5">
    <span>{title}</span>
    <span className="text-muted-foreground text-xs">{detail}</span>
  </span>
);

type Notice = { text: string; warn: boolean };

type Props = {
  libraryOpen?: boolean;
  onToggleLibrary?: () => void;
};

export const TopBar = ({ libraryOpen, onToggleLibrary }: Props) => {
  const t = useTranslations("Studio");
  const tExport = useTranslations("Studio.export");
  const learnMode = usePreferencesStore((s) => s.learnMode);
  const setLearnMode = usePreferencesStore((s) => s.setLearnMode);
  const learnId = useId();
  const simulating = useStudioStore((s) => s.simulating);
  const setSimulating = useStudioStore((s) => s.setSimulating);
  const tParts = useTranslations("Parts");
  const onPcb = useProjectStore((s) => s.foundation === "pcb");
  const hasComponents = useProjectStore((s) => s.components.length > 0);
  const hasParts = useProjectStore((s) =>
    s.components.some((c) => partsById.get(c.specId)?.footprintId),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const hostSpecId = useProjectStore(
    (s) => s.components.find((c) => partsById.get(c.specId)?.host)?.specId,
  );

  const exportFiles = () => {
    const project = useProjectStore.getState();
    const base = fileBase(project.name);
    const { bytes, unrouted } = fabricationZip(project, base);
    saveFile(bytes, `${base}-fabrication.zip`, "application/zip");
    setNotice(
      unrouted.length
        ? { text: tExport("unrouted", { count: unrouted.length }), warn: true }
        : null,
    );
  };

  /** The schematic editor's drawing as a file, or `null`, with a note, when the schematic isn't on screen. */
  const schematicImage = () => {
    const svg = document.querySelector("[data-schematic-content]")?.closest("svg");
    const image = svg ? schematicSvg(svg) : null;
    if (!image) setNotice({ text: tExport("schematicClosed"), warn: true });
    return image;
  };

  const exportSchematicSvg = () => {
    const image = schematicImage();
    if (!image) return;
    saveFile(
      image.svg,
      `${fileBase(useProjectStore.getState().name)}-schematic.svg`,
      "image/svg+xml",
    );
  };

  const exportSchematicPdf = async () => {
    const image = schematicImage();
    if (!image) return;
    const { name } = useProjectStore.getState();
    const pdf = await schematicPdf(image, name.trim() || t("untitledProject"));
    saveFile(pdf, `${fileBase(name)}-schematic.pdf`, "application/pdf");
  };

  const exportSpice = () => {
    const project = useProjectStore.getState();
    const { deck, skipped } = projectSpice(project, partsById);
    saveFile(deck, `${fileBase(project.name)}.cir`, "text/plain");
    setNotice(
      skipped.length
        ? { text: tExport("spiceSkipped", { count: skipped.length }), warn: false }
        : null,
    );
  };

  const exportWiring = () => {
    const project = useProjectStore.getState();
    saveFile(
      pinoutCsv(projectPinout(project, partsById)),
      `${fileBase(project.name)}-wiring.csv`,
      "text/csv",
    );
  };

  const exportProject = () => {
    const project = useProjectStore.getState();
    saveFile(
      projectJson(project, window.location.origin),
      `${fileBase(project.name)}.echidna.json`,
      "application/json",
    );
  };

  const openProject = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared so choosing the same file again still opens it.
    e.target.value = "";
    if (!file) return;
    const parsed = parseProjectFile(await file.text(), partsById);
    if (!parsed.ok) {
      const { error } = parsed;
      const text =
        error.code === "parts"
          ? tExport("open.parts", { parts: error.parts.join(", ") })
          : error.code === "invalid"
            ? tExport("open.invalid", { path: error.path })
            : tExport(`open.${error.code}`);
      setNotice({ text, warn: true });
      return;
    }
    useStudioStore.getState().select(null);
    useProjectStore.getState().loadProject(parsed.project);
    setNotice({ text: tExport("open.done", { name: file.name }), warn: false });
  };

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
        {notice && (
          <span
            role="status"
            title={notice.text}
            className={`max-w-80 truncate text-xs max-lg:hidden ${notice.warn ? "text-status-warn-text" : "text-muted-foreground"}`}
          >
            {notice.text}
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => void openProject(e)}
        />
        <IconButton label={tExport("open.label")} onClick={() => fileInput.current?.click()}>
          <FolderOpen />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={!hasComponents}>
              <Download data-icon="inline-start" />
              <span className="max-sm:sr-only">{tExport("label")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <DropdownMenuItem onSelect={exportFiles} disabled={!hasParts}>
              <CircuitBoard />
              <ExportItem
                title={tExport("fabrication")}
                detail={onPcb ? tExport("pcb") : tExport("modules")}
              />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{tExport("schematicGroup")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={exportSchematicSvg}>
              <FileImage />
              <ExportItem title={tExport("svg")} detail={tExport("svgDetail")} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportSchematicPdf()}>
              <FileText />
              <ExportItem title={tExport("pdf")} detail={tExport("pdfDetail")} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportSpice}>
              <Waypoints />
              <ExportItem title={tExport("spice")} detail={tExport("spiceDetail")} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportWiring}>
              <Sheet />
              <ExportItem title={tExport("wiring")} detail={tExport("wiringDetail")} />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportProject}>
              <Braces />
              <ExportItem title={tExport("project")} detail={tExport("projectDetail")} />
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={PROJECT_SCHEMA_PATH}
                target="_blank"
                rel="noreferrer"
                className="text-foreground no-underline"
              >
                <FileCode2 />
                <ExportItem title={tExport("schema")} detail={tExport("schemaDetail")} />
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
