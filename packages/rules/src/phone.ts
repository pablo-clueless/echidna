import type { ComponentSpec, ModuleRole, SpecValue } from "@echidna/core";

import { check, type FitCheck } from "./slots";
import defaults from "../rules.json";
import { grade } from "./engine";

type Thresholds = { warnAt: number; failAbove: number };

export const phoneThresholds = defaults.phone as Record<"pmicRail", Thresholds>;

/**
 * The PMIC rail budgets of a phone or wearable: for each rail the PMIC supplies, the current every part on it draws
 * at peak, its `power` over the rail's voltage, against what the rail can supply. A rail nothing draws from is left
 * out, as is every rail until a PMIC is plugged in.
 * @param board - The logic board, the host.
 * @param modules - Everything plugged into it.
 * @returns One check per rail in use, in the PMIC's order.
 */
export const checkPhone = (board: ComponentSpec, modules: readonly ComponentSpec[]): FitCheck[] => {
  const build = [board, ...modules];
  const rails = build.find((m) => m.module?.role === "pmic")?.module?.rails ?? [];
  return rails.flatMap((rail) => {
    const powers = build.flatMap((m) =>
      m.module?.rail === rail.id && m.module.power ? [m.module.power] : [],
    );
    if (powers.length === 0) return [];
    const draw = powers.reduce((sum, p) => sum + p.value, 0) / rail.voltage.value;
    return [
      check(
        "pmicRail",
        grade(draw / rail.maxCurrent.value, phoneThresholds.pmicRail),
        [...powers, rail.voltage, rail.maxCurrent] as SpecValue[],
        { actual: draw, limit: rail.maxCurrent.value, unit: "A", railId: rail.id },
      ),
    ];
  });
};

/**
 * The rail checks a part bears on, so a swap shows only the ones it can change: a PMIC bears on every rail, any
 * other part on the one it draws from.
 * @param part - The part being plugged in or swapped.
 * @param checks - The build's rail checks with the part in.
 * @returns The checks that concern it.
 */
export const phoneChecksFor = (part: ComponentSpec, checks: readonly FitCheck[]): FitCheck[] => {
  const role: ModuleRole | undefined = part.module?.role;
  if (role === "pmic") return [...checks];
  return checks.filter((c) => c.railId !== undefined && c.railId === part.module?.rail);
};
