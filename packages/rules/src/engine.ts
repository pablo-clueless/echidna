import { anyEstimated, type Ratings, type Severity, type Unit, type Violation } from "@echidna/core";
import type { DcSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";

import defaults from "../rules.json";

export type Metric = "voltage" | "current" | "power";

/** Compares a solved quantity against one of a part's ratings. Thresholds are fractions of the rating. */
export type RatingRule = {
  id: string;
  metric: Metric;
  rating: keyof Ratings;
  warnAt: number;
  failAbove: number;
};

export const defaultRules = defaults.rules as RatingRule[];

const units: Record<Metric, Unit> = { voltage: "V", current: "A", power: "W" };

/**
 * Grades a ratio of actual to rated value.
 * @param ratio - Actual divided by the rating.
 * @param rule - Thresholds to apply.
 * @returns `fail` above `failAbove`, `warn` from `warnAt`, otherwise `pass`.
 */
export const grade = (ratio: number, rule: Pick<RatingRule, "warnAt" | "failAbove">): Severity =>
  ratio > rule.failAbove ? "fail" : ratio >= rule.warnAt ? "warn" : "pass";

const measure = (metric: Metric, voltages: number[], currents: number[], power: number): number => {
  switch (metric) {
    case "voltage":
      return voltages.length < 2 ? 0 : Math.max(...voltages) - Math.min(...voltages);
    case "current":
      return Math.max(0, ...currents.map(Math.abs));
    case "power":
      return Math.max(0, power);
  }
};

/**
 * Runs every rule against every solved component that carries the rating the rule checks.
 * @param build - Circuit and spec mapping from `toCircuit`.
 * @param solution - DC operating point for that circuit.
 * @param rules - Rules to apply; defaults to `rules.json`.
 * @returns One verdict per component and applicable rule, passes included.
 */
export const evaluate = (
  build: CircuitBuild,
  solution: DcSolution,
  rules: readonly RatingRule[] = defaultRules,
): Violation[] => {
  const violations: Violation[] = [];
  for (const element of build.circuit.elements) {
    const spec = build.specs[element.id];
    if (!spec) continue;
    for (const rule of rules) {
      const rating = spec.ratings[rule.rating];
      if (!rating || rating.value <= 0) continue;
      const pinIds = spec.ratingPins?.[rule.rating] ?? spec.pins.map((p) => p.id);
      const indexes = pinIds.map((id) => spec.pins.findIndex((p) => p.id === id)).filter((i) => i >= 0);
      const voltages = indexes.map((i) => solution.nodeVoltages[element.nodes[i] ?? ""] ?? 0);
      const currents = indexes.map((i) => solution.pinCurrents[element.id]?.[i] ?? 0);
      const actual = measure(rule.metric, voltages, currents, solution.componentPower[element.id] ?? 0);
      violations.push({
        componentId: element.id,
        ruleId: rule.id,
        actual,
        limit: rating.value,
        unit: units[rule.metric],
        severity: grade(actual / rating.value, rule),
        estimated: anyEstimated([rating, ...Object.values(spec.params)]),
      });
    }
  }
  return violations;
};
