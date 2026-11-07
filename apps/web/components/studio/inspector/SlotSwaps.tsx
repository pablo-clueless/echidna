"use client";

import type { NetlistComponent } from "@echidna/core";
import { parts, partsById } from "@echidna/library";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { dotClass, failsOnEstimates, textClass, useCheckReason } from "./SlotPicker";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/components/ui/button";
import { slotSwaps } from "@/lib/project/slots";
import { partKey } from "@/lib/messageKeys";
import { cn } from "@/lib/utils";

/**
 * Parts the selected one can be swapped for without leaving its slots, each checked before it is offered: other
 * sensors for one that is plugged in, other dev boards for one with parts plugged in. A swap that would not fit
 * says why and cannot be applied.
 */
export const SlotSwaps = ({ component }: { component: NetlistComponent }) => {
  const t = useTranslations("Studio.slots");
  const tParts = useTranslations("Parts");
  const components = useProjectStore((s) => s.components);
  const slots = useProjectStore((s) => s.slots);
  const swapInSlots = useProjectStore((s) => s.swapInSlots);
  const reasonFor = useCheckReason();
  const swaps = useMemo(
    () => slotSwaps({ components, slots }, partsById, parts, component.id),
    [components, slots, component.id],
  );
  if (swaps.length === 0) return null;
  const hostOf = (partId: string) =>
    partsById.get(components.find((c) => c.id === (slots[partId]?.hostId ?? ""))?.specId ?? "");

  return (
    <section aria-labelledby="slot-swaps-heading" className="grid gap-2">
      <h3 id="slot-swaps-heading" className="text-muted-foreground text-xs font-medium">
        {t("swapTitle")}
      </h3>
      <ul className="grid gap-1.5">
        {swaps.map((swap) => {
          const name = tParts(`${partKey(swap.specId)}.name`);
          const checks = Object.values(swap.byPart).flatMap((fit) => fit.checks);
          const severity = !swap.fits
            ? "fail"
            : checks.some((c) => c.severity === "warn")
              ? "warn"
              : "pass";
          const candidate = partsById.get(swap.specId);
          const problems = Object.entries(swap.byPart).flatMap(([partId, fit]) =>
            fit.checks
              .filter((c) => c.severity !== "pass")
              .map((c) => ({
                key: `${partId}:${c.id}`,
                // A host swap is refused for what is plugged into it, so say which part each reason is about.
                text:
                  partId === component.id
                    ? reasonFor(c, hostOf(partId))
                    : t("partReason", { id: partId, reason: reasonFor(c, candidate) }),
              })),
          );
          return (
            <li
              key={swap.specId}
              aria-label={name}
              className="grid gap-1 rounded-md border px-2.5 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{name}</span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!swap.fits}
                  onClick={() => swapInSlots(component.id, swap.specId)}
                >
                  {t("swap")}
                </Button>
              </div>
              <p className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-1.5 shrink-0", dotClass[severity])} />
                <span className={cn("font-medium", textClass[severity])}>
                  {swap.fits
                    ? t("swapFits")
                    : failsOnEstimates(checks)
                      ? t("swapLikelyFails")
                      : t("swapFails")}
                </span>
              </p>
              {problems.length > 0 && (
                <ul className="text-foreground grid gap-0.5 pl-3">
                  {problems.map((p) => (
                    <li key={p.key}>{p.text}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
