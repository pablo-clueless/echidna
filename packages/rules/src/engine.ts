import { anyEstimated, type Ratings, ratingRatio, type Severity, type Unit, type Violation } from "@echidna/core";
import type { DcSolution, TransientSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";

import defaults from "../rules.json";

export type Metric = "voltage" | "current" | "power" | "temperature";

/** Air temperature around the board when the project sets none: 25 °C, in kelvin. */
export const DEFAULT_AMBIENT = 298.15;

/**
 * Compares a solved quantity against one of a part's ratings. Thresholds are fractions of the rating.
 *
 * `temperature` is estimated from the part's dissipation and its `thermalResistance` (junction or body to the
 * surrounding air), and its thresholds are fractions of the rise the part can take above that air, not of the
 * rating in kelvin. Parts without a thermal resistance are not checked.
 *
 * `analysis` picks what the rule checks: the DC operating point (the default) or the run from switch-on. On a
 * switch-on run, the rule grades the worst moment, or with `window` (in seconds) the worst average over any window
 * that long. Averaging suits current and power, whose ratings are about heating: it ignores the brief spike an
 * ideal supply drives into a discharged capacitor, which lasts a single time step and has no physical size.
 */
export type RatingRule = {
  id: string;
  analysis?: "dc" | "switchOn";
  metric: Metric;
  rating: keyof Ratings;
  window?: number;
  warnAt: number;
  failAbove: number;
};

export const defaultRules = defaults.rules as RatingRule[];

const units: Record<Metric, Unit> = { voltage: "V", current: "A", power: "W", temperature: "K" };

/**
 * Grades a ratio of actual to rated value.
 * @param ratio - How much of the rating is used, from `ratingRatio`.
 * @param rule - Thresholds to apply.
 * @returns `fail` above `failAbove`, `warn` from `warnAt`, otherwise `pass`.
 */
export const grade = (ratio: number, rule: Pick<RatingRule, "warnAt" | "failAbove">): Severity =>
  ratio > rule.failAbove ? "fail" : ratio >= rule.warnAt ? "warn" : "pass";

/** What a part's temperature is estimated from: its thermal resistance in K/W and the surrounding air in kelvin. */
type Heat = { resistance: number; ambient: number };

/**
 * Estimates a part's temperature from the heat it dissipates.
 * @param power - Dissipation in watts; negative values (a source delivering power) count as none.
 * @param heat - The part's thermal resistance and the air temperature.
 * @returns The temperature in kelvin.
 */
export const partTemperature = (power: number, heat: Heat): number =>
  heat.ambient + Math.max(0, power) * heat.resistance;

const measure = (metric: Metric, voltages: number[], currents: number[], power: number, heat: Heat): number => {
  switch (metric) {
    case "voltage":
      return voltages.length < 2 ? 0 : Math.max(...voltages) - Math.min(...voltages);
    case "current":
      return Math.max(0, ...currents.map(Math.abs));
    case "power":
      return Math.max(0, power);
    case "temperature":
      return partTemperature(power, heat);
  }
};

/**
 * Highest mean of `samples` over any `width` consecutive samples. The run ends once the circuit has settled, so
 * windows that run past the end continue at the last value.
 * @param samples - Equally spaced values.
 * @param width - Window length in samples.
 * @returns The worst window's mean.
 */
export const worstAverage = (samples: readonly number[], width: number): number => {
  const last = samples.at(-1) ?? 0;
  const at = (i: number) => (i < samples.length ? (samples[i] ?? 0) : last);
  const n = Math.max(1, Math.round(width));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += at(i);
  let worst = sum;
  for (let start = 1; start < samples.length; start++) {
    sum += at(start + n - 1) - at(start - 1);
    worst = Math.max(worst, sum);
  }
  return worst / n;
};

type Reading = (
  element: CircuitBuild["circuit"]["elements"][number],
  rule: RatingRule,
  indexes: number[],
  heat: Heat,
) => number;

const check = (build: CircuitBuild, rules: readonly RatingRule[], ambient: number, read: Reading): Violation[] => {
  const violations: Violation[] = [];
  for (const element of build.circuit.elements) {
    const spec = build.specs[element.id];
    if (!spec) continue;
    const resistance = spec.params.thermalResistance?.value ?? 0;
    for (const rule of rules) {
      const rating = spec.ratings[rule.rating];
      if (!rating || rating.value <= 0) continue;
      if (rule.metric === "temperature" && resistance <= 0) continue;
      const pinIds = spec.ratingPins?.[rule.rating] ?? spec.pins.map((p) => p.id);
      const indexes = pinIds.map((id) => spec.pins.findIndex((p) => p.id === id)).filter((i) => i >= 0);
      const actual = read(element, rule, indexes, { resistance, ambient });
      const baseline = rule.metric === "temperature" ? ambient : undefined;
      const inputs = Object.entries(spec.params)
        .filter(([key]) => rule.metric === "temperature" || key !== "thermalResistance")
        .map(([, value]) => value);
      violations.push({
        componentId: element.id,
        ruleId: rule.id,
        actual,
        limit: rating.value,
        unit: units[rule.metric],
        severity: grade(ratingRatio({ actual, limit: rating.value, baseline }), rule),
        estimated: anyEstimated([rating, ...inputs]),
        ...(baseline === undefined ? {} : { baseline }),
      });
    }
  }
  return violations;
};

/**
 * Runs every DC rule against every solved component that carries the rating the rule checks.
 * @param build - Circuit and spec mapping from `toCircuit`.
 * @param solution - DC operating point for that circuit.
 * @param rules - Rules to apply; defaults to `rules.json`, of which only the DC rules run.
 * @param ambient - Air temperature around the board in kelvin, for temperature rules.
 * @returns One verdict per component and applicable rule, passes included.
 */
export const evaluate = (
  build: CircuitBuild,
  solution: DcSolution,
  rules: readonly RatingRule[] = defaultRules,
  ambient = DEFAULT_AMBIENT,
): Violation[] =>
  check(
    build,
    rules.filter((r) => (r.analysis ?? "dc") === "dc"),
    ambient,
    (element, rule, indexes, heat) =>
      measure(
        rule.metric,
        indexes.map((i) => solution.nodeVoltages[element.nodes[i] ?? ""] ?? 0),
        indexes.map((i) => solution.pinCurrents[element.id]?.[i] ?? 0),
        solution.componentPower[element.id] ?? 0,
        heat,
      ),
  );

/**
 * Runs the switch-on rules over a run from switch-on, catching what the operating point cannot show: overshoot,
 * and a part overloaded while a large capacitor charges.
 * @param build - Circuit and spec mapping from `toCircuit`.
 * @param solution - Switch-on run for that circuit, with equal steps.
 * @param rules - Rules to apply; defaults to `rules.json`, of which only the switch-on rules run. Temperature rules
 * never do: parts take seconds to warm up, far longer than a switch-on run, so its peaks say nothing about heat.
 * @returns One verdict per component and applicable rule, passes included.
 */
export const evaluateSwitchOn = (
  build: CircuitBuild,
  solution: TransientSolution,
  rules: readonly RatingRule[] = defaultRules,
): Violation[] => {
  const step = solution.times[0] ?? 0;
  return check(
    build,
    rules.filter((r) => r.analysis === "switchOn" && r.metric !== "temperature"),
    DEFAULT_AMBIENT,
    (element, rule, indexes, heat) => {
      const series = solution.times.map((_, t) =>
        measure(
          rule.metric,
          indexes.map((i) => solution.nodeVoltages[element.nodes[i] ?? ""]?.[t] ?? 0),
          indexes.map((i) => solution.pinCurrents[element.id]?.[i]?.[t] ?? 0),
          solution.componentPower[element.id]?.[t] ?? 0,
          heat,
        ),
      );
      return rule.window && step > 0 ? worstAverage(series, rule.window / step) : Math.max(0, ...series);
    },
  );
};
