"use client";

import { useLocale, useTranslations } from "next-intl";
import type { NetlistComponent } from "@echidna/core";
import { partsById } from "@echidna/library";
import { useEffect, useState } from "react";

import { gradeSwaps, neighbourValues, swapCandidates, type SwapVerdict } from "@/lib/simulation/swaps";
import { paramValue, type ProjectData } from "@/lib/project/model";
import { getSolver } from "@/lib/simulation/solver";
import { useProjectStore } from "@/stores/project";
import { formatQuantity } from "@/lib/units";
import { cn } from "@/lib/utils";

const dotClass = {
  pass: "bg-status-pass",
  warn: "bg-status-warn ring-1 ring-status-warn-border",
  fail: "bg-status-fail",
} as const;

const textClass = {
  pass: "text-status-pass-text",
  warn: "text-status-warn-text",
  fail: "text-status-fail-text",
} as const;

type Props = { component: NetlistComponent; param: string };

/**
 * Standard values either side of the current one, each solved and checked before it is offered, so the
 * user sees whether it fits before applying it.
 */
export const SwapSuggestions = ({ component, param }: Props) => {
  const t = useTranslations("Studio.inspector");
  const locale = useLocale();
  const components = useProjectStore((s) => s.components);
  const wires = useProjectStore((s) => s.wires);
  const setParam = useProjectStore((s) => s.setParam);
  const spec = partsById.get(component.specId);
  const current = spec ? paramValue(component, spec, param) : undefined;
  const unit = spec?.params[param]?.unit ?? "";
  const [result, setResult] = useState<{ components: ProjectData["components"]; wires: ProjectData["wires"]; verdicts: SwapVerdict[] } | null>(null);

  const values = spec && current !== undefined ? neighbourValues(spec.kind, current) : [];
  const valuesKey = values.join(",");

  useEffect(() => {
    if (!valuesKey) return;
    const candidates = swapCandidates({ components, wires }, component.id, param, valuesKey.split(",").map(Number));
    let live = true;
    void getSolver()
      .solveBatch(candidates.map((c) => c.build.circuit))
      .then((outcomes) => {
        if (live && outcomes) setResult({ components, wires, verdicts: gradeSwaps(candidates, outcomes) });
      });
    return () => {
      live = false;
    };
  }, [components, wires, component.id, param, valuesKey]);

  if (values.length === 0) return null;
  const verdicts = result?.components === components && result.wires === wires ? result.verdicts : null;
  const candidates = values.map((value) => ({ value }));

  return (
    <section aria-labelledby="swap-heading" className="grid gap-2">
      <h3 id="swap-heading" className="text-xs font-medium text-muted-foreground">
        {t("swapsTitle")}
      </h3>
      <ul className="grid grid-cols-2 gap-1.5 @xs:grid-cols-3" aria-busy={!verdicts}>
        {candidates.map((c, i) => {
          const v = verdicts?.[i];
          const severity = v?.severity;
          return (
            <li key={c.value}>
              <button
                type="button"
                onClick={() => setParam(component.id, param, c.value)}
                className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("swapTo", {
                  value: formatQuantity(c.value, unit, locale),
                  verdict: severity ? t(`swapVerdict.${severity}`) : t("checking"),
                })}
              >
                <span className="font-mono text-xs tabular-nums">{formatQuantity(c.value, unit, locale)}</span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", severity ? dotClass[severity] : "bg-muted-foreground/40")}
                  />
                  <span className={cn("text-[11px]", severity ? textClass[severity] : "text-muted-foreground")}>
                    {severity ? t(`swapVerdict.${severity}`) : t("checking")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
