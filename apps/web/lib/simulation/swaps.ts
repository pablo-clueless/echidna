import { compareViolations, type ComponentSpec, type Severity, type Violation } from "@echidna/core";
import { type CircuitBuild, partsById, toCircuit } from "@echidna/library";
import type { DcSolution, SolveOutcome } from "@echidna/solver/types";
import { evaluate } from "@echidna/rules";

import { type ProjectData, toNetlist } from "@/lib/project/model";

const series: Record<string, readonly number[]> = {
  E6: [1, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
};

/** Which standard series to suggest values from, per part kind. */
const kindSeries: Record<string, keyof typeof series> = { resistor: "E12", capacitor: "E6", inductor: "E6" };

/**
 * Standard values either side of the current one.
 * @param kind - The spec's `kind`.
 * @param current - Current value in SI units.
 * @param each - How many values to offer below and above.
 * @returns Candidate values, lowest first, excluding the current value.
 */
export const neighbourValues = (kind: string, current: number, each = 3): number[] => {
  const name = kindSeries[kind];
  if (!name || !(current > 0)) return [];
  const decade = Math.floor(Math.log10(current));
  const values = [decade - 1, decade, decade + 1].flatMap((d) =>
    (series[name] ?? []).map((m) => Number((m * 10 ** d).toPrecision(3))),
  );
  const below = values.filter((v) => v < current * 0.999).slice(-each);
  const above = values.filter((v) => v > current * 1.001).slice(0, each);
  return [...below, ...above];
};

export type SwapCandidate = { value: number; build: CircuitBuild };

export type SwapVerdict = {
  value: number;
  severity: Severity;
  estimated: boolean;
  /** The worst issue the swap would cause anywhere in the circuit. */
  worst: Violation | null;
};

/**
 * Builds a variant circuit per candidate value of one parameter.
 * @param project - Current project.
 * @param componentId - Part being swapped.
 * @param key - Parameter to vary.
 * @param values - Candidate values.
 * @returns One circuit build per candidate.
 */
export const swapCandidates = (
  project: Pick<ProjectData, "components" | "wires">,
  componentId: string,
  key: string,
  values: readonly number[],
): SwapCandidate[] =>
  values.map((value) => ({
    value,
    build: toCircuit(
      toNetlist({
        ...project,
        components: project.components.map((c) =>
          c.id === componentId ? { ...c, paramOverrides: { ...c.paramOverrides, [key]: value } } : c,
        ),
      }),
      partsById,
    ),
  }));

/**
 * Grades each candidate by the worst verdict it would produce across the whole circuit.
 * @param candidates - Variants from `swapCandidates`.
 * @param outcomes - Solver outcomes in the same order.
 * @param ambient - Air temperature around the board in kelvin.
 * @returns A fits / warns / fails verdict per candidate.
 */
export const gradeSwaps = (
  candidates: readonly SwapCandidate[],
  outcomes: readonly SolveOutcome[],
  ambient?: number,
): SwapVerdict[] =>
  candidates.map(({ value, build }, i) => {
    const outcome = outcomes[i];
    if (!outcome?.ok) return { value, severity: "fail", estimated: false, worst: null };
    const worst = evaluate(build, outcome.solution as DcSolution, undefined, ambient).sort(compareViolations)[0] ?? null;
    return {
      value,
      severity: worst?.severity ?? "pass",
      estimated: worst?.estimated ?? false,
      worst: worst && worst.severity !== "pass" ? worst : null,
    };
  });

const swapParams: Record<string, string> = { resistor: "resistance", capacitor: "capacitance", inductor: "inductance" };

/**
 * Whether a part has a value worth offering swaps for.
 * @param spec - Part spec.
 * @returns The parameter to vary, if any.
 */
export const swapParam = (spec: ComponentSpec): string | undefined => swapParams[spec.kind];
