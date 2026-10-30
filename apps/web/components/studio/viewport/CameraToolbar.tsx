"use client";

import { Box, Minus, Plus, Scan, SquareDashed, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type CameraCommands, useViewportStore } from "@/stores/viewport";
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
  ],
];

const shown = (key: string) => (key === "-" ? "−" : key.length === 1 ? key.toUpperCase() : key);

/** On-screen camera controls for the 3D view: zoom, fit the board, and preset angles. */
export const CameraToolbar = () => {
  const t = useTranslations("Studio.viewport.controls");
  const camera = useViewportStore((s) => s.camera);

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      aria-orientation="vertical"
      className="absolute top-2 right-2 flex flex-col gap-1"
    >
      {groups.map((group, i) => (
        <div key={i} className="flex flex-col rounded-lg border bg-background/85 p-0.5 shadow-xs backdrop-blur-sm">
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
    </div>
  );
};
