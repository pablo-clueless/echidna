import type { SolveResult } from "@echidna/core";

/** Element models understood by the solver. Mirrors `ElementKind` in `crates/solver`. */
export type ElementKind =
  | { kind: "resistor"; resistance: number }
  | { kind: "capacitor"; capacitance: number }
  | { kind: "inductor"; inductance: number }
  | { kind: "voltageSource"; voltage: number }
  | { kind: "currentSource"; current: number }
  | { kind: "diode"; saturationCurrent: number; emissionCoefficient?: number; seriesResistance?: number }
  | { kind: "linearRegulator"; outputVoltage: number; dropoutVoltage?: number; quiescentCurrent?: number };

/** A solver element: one node name per pin, in the order the kind defines. */
export type CircuitElement = ElementKind & { id: string; nodes: string[] };

export type Circuit = {
  ground: string;
  elements: CircuitElement[];
};

export type DcSolution = SolveResult & {
  pinCurrents: Record<string, number[]>;
  iterations: number;
};

export type SolveError =
  | { code: "pinCount"; elementId: string; expected: number; actual: number }
  | { code: "invalidValue"; elementId: string; reason: string }
  | { code: "singular" }
  | { code: "noConvergence"; iterations: number }
  | { code: "internal"; message: string };

export type SolveOutcome =
  | { ok: true; solution: DcSolution; durationMs: number }
  | { ok: false; error: SolveError; durationMs: number };

/**
 * Narrows an unknown thrown value to a structured solver error.
 * @param value - Anything caught from the WASM boundary.
 * @returns Whether the value carries a known error `code`.
 */
export const isSolveError = (value: unknown): value is SolveError =>
  typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
