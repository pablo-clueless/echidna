"use client";

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Box,
  RotateCwSquare,
  Flame,
  FlipVertical2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Scan,
  SquareDashed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { type MaskColour, maskColours, type Overlay, useLayoutStore } from "@/stores/layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type CameraCommands, useViewportStore } from "@/stores/viewport";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

type Command = Exclude<keyof CameraCommands, "pan">;

/** Keys that trigger each command while the 3D view has focus; the first is shown in the tooltip. */
export const cameraShortcuts: Record<Command, string[]> = {
  zoomIn: ["+", "="],
  zoomOut: ["-", "_"],
  fit: ["f", "F"],
  top: ["t", "T"],
  angled: ["Home"],
  underside: ["b", "B"],
  orbitLeft: ["q", "Q"],
  orbitRight: ["e", "E"],
  tiltUp: ["w", "W"],
  tiltDown: ["s", "S"],
};

/** Keys that turn the selected part a quarter turn on the board. */
export const turnPartShortcuts = ["r", "R"];

/** Swatch shown for each solder-mask colour; matches the board's mask in the 3D view. */
const swatches: Record<MaskColour, string> = {
  black: "#0C0D0F",
  green: "#0E4A28",
  blue: "#0E2C5E",
  red: "#6E1212",
};

const groups: { command: Command; icon: LucideIcon }[][] = [
  [
    { command: "zoomIn", icon: Plus },
    { command: "zoomOut", icon: Minus },
  ],
  [
    { command: "fit", icon: Scan },
    { command: "angled", icon: Box },
    { command: "top", icon: SquareDashed },
    { command: "underside", icon: FlipVertical2 },
  ],
  [
    { command: "orbitLeft", icon: RotateCcw },
    { command: "orbitRight", icon: RotateCw },
    { command: "tiltUp", icon: ArrowUpToLine },
    { command: "tiltDown", icon: ArrowDownToLine },
  ],
];

const overlayIcons: Record<Overlay, LucideIcon> = { current: Zap, heat: Flame };

const shown = (key: string) => (key === "-" ? "−" : key.length === 1 ? key.toUpperCase() : key);

/**
 * On-screen controls for the 3D view: zoom, fit the board, preset angles, simulation overlays and, on a PCB, the
 * solder-mask colour. A chassis has no copper or mask, so it offers neither the current overlay nor mask colours.
 */
export const CameraToolbar = () => {
  const t = useTranslations("Studio.viewport.controls");
  const tMask = useTranslations("Studio.viewport.mask");
  const tOverlays = useTranslations("Studio.viewport.overlays");
  const camera = useViewportStore((s) => s.camera);
  const maskColour = useLayoutStore((s) => s.maskColour);
  const setMaskColour = useLayoutStore((s) => s.setMaskColour);
  const shownOverlays = useLayoutStore((s) => s.overlays);
  const setOverlays = useLayoutStore((s) => s.setOverlays);
  const onPcb = useProjectStore((s) => s.foundation === "pcb");
  const selectedPart = useStudioStore((s) => s.selectedComponentId);
  const onBoard = useProjectStore((s) => Boolean(selectedPart && s.board[selectedPart]));
  const overlays = (Object.keys(overlayIcons) as Overlay[]).filter((o) => onPcb || o !== "current");

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      aria-orientation="vertical"
      className="absolute top-2 right-2 flex max-h-[calc(100%-1rem)] flex-col gap-1 overflow-y-auto"
    >
      {groups.map((group, i) => (
        <div
          key={i}
          className="bg-background/85 flex flex-col rounded-lg border p-0.5 shadow-xs backdrop-blur-sm"
        >
          {group.map(({ command, icon: Icon }) => (
            <Tooltip key={command}>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t(command)}
                  // "+" separates keys in aria-keyshortcuts, so the plus key is spelt out.
                  aria-keyshortcuts={cameraShortcuts[command][0]?.replace(/^\+$/, "Plus")}
                  disabled={!camera}
                  onClick={() => camera?.[command]()}
                >
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t(command)} <Kbd>{shown(cameraShortcuts[command][0] ?? "")}</Kbd>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      ))}
      <div className="bg-background/85 flex flex-col rounded-lg border p-0.5 shadow-xs backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("turnPart")}
              aria-keyshortcuts={turnPartShortcuts[0]}
              disabled={!selectedPart || !onBoard}
              onClick={() => selectedPart && useProjectStore.getState().rotateOnBoard(selectedPart)}
            >
              <RotateCwSquare />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t("turnPart")} <Kbd>R</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <ToggleGroup
        type="multiple"
        orientation="vertical"
        size="sm"
        spacing={0}
        aria-label={tOverlays("label")}
        value={shownOverlays.filter((o) => overlays.includes(o))}
        // Keeps overlays hidden on a chassis switched on, for when the project is back on a PCB.
        onValueChange={(value) =>
          setOverlays([
            ...shownOverlays.filter((o) => !overlays.includes(o)),
            ...(value as Overlay[]),
          ])
        }
        className="bg-background/85 rounded-lg border p-0.5 shadow-xs backdrop-blur-sm"
      >
        {overlays.map((overlay) => {
          const Icon = overlayIcons[overlay];
          return (
            <Tooltip key={overlay}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={overlay}
                  aria-label={tOverlays(overlay)}
                  className="aria-pressed:bg-primary/15 aria-pressed:text-primary-text size-8"
                >
                  <Icon />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="left">{tOverlays(overlay)}</TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
      {onPcb && (
        <ToggleGroup
          type="single"
          orientation="vertical"
          size="sm"
          spacing={0}
          aria-label={tMask("label")}
          value={maskColour}
          onValueChange={(value) => {
            if (value) setMaskColour(value as MaskColour);
          }}
          className="bg-background/85 rounded-lg border p-0.5 shadow-xs backdrop-blur-sm"
        >
          {maskColours.map((colour) => (
            <Tooltip key={colour}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={colour}
                  aria-label={tMask(colour)}
                  className="aria-checked:bg-primary/15 size-8"
                >
                  <span
                    aria-hidden
                    className="ring-foreground/25 size-3.5 ring-1"
                    style={{ backgroundColor: swatches[colour] }}
                  />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="left">
                {tMask("label")}: {tMask(colour)}
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
};
