"use client";

import { useLocale, useTranslations } from "next-intl";

import { heatGradient, HEAT_RANGE, HEAT_STOPS } from "@/lib/board/heat";
import { formatQuantity, fromCelsius } from "@/lib/units";
import { useLayoutStore } from "@/stores/layout";
import { useStudioStore } from "@/stores/studio";

/** Explains the 3D overlays that are switched on: the direction and speed of current dashes, and the heat scale. */
export const OverlayLegend = () => {
  const t = useTranslations("Studio.viewport.overlays");
  const locale = useLocale();
  const overlays = useLayoutStore((s) => s.overlays);
  const solved = useStudioStore((s) => Boolean(s.simulation?.solution));
  if (overlays.length === 0) return null;
  const { low, high } = HEAT_RANGE;

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 grid max-w-64 gap-2 rounded-lg border bg-background/85 px-2.5 py-2 text-xs shadow-xs backdrop-blur-sm">
      {!solved ? (
        <p className="text-muted-foreground">{t("unsolved")}</p>
      ) : (
        <>
          {overlays.includes("current") && (
            <div className="grid gap-1">
              <p className="font-medium">{t("current")}</p>
              <p className="text-muted-foreground">{t("currentHint")}</p>
            </div>
          )}
          {overlays.includes("heat") && (
            <div className="grid gap-1">
              <p className="font-medium">{t("heatTitle")}</p>
              <div aria-hidden className="h-2 rounded-full" style={{ backgroundImage: heatGradient() }} />
              <div className="relative h-4 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                {HEAT_STOPS.map((s) => {
                  // Each label sits under its stop, shifted by the same share of its width so the ends stay inside.
                  const at = ((s.celsius - low) / (high - low)) * 100;
                  return (
                    <span key={s.celsius} className="absolute top-0" style={{ left: `${at}%`, translate: `-${at}% 0` }}>
                      {formatQuantity(fromCelsius(s.celsius), "K", locale)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
