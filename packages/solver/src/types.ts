import type { SolveResult } from "@echidna/core";

/** Element models understood by the solver. Mirrors `ElementKind` in `crates/solver`. */
export type ElementKind =
  | { kind: "resistor"; resistance: number }
  /** `closed` is 1 to conduct through the contact resistance, 0 for an ideal open circuit. */
  | { kind: "switch"; contactResistance: number; closed?: number }
  | { kind: "capacitor"; capacitance: number }
  | { kind: "inductor"; inductance: number }
  | { kind: "voltageSource"; voltage: number }
  | { kind: "currentSource"; current: number }
  | {
      kind: "diode";
      saturationCurrent: number;
      emissionCoefficient?: number;
      seriesResistance?: number;
    }
  | {
      kind: "linearRegulator";
      outputVoltage: number;
      dropoutVoltage?: number;
      quiescentCurrent?: number;
    }
  | {
      kind: "bjt";
      polarity: "npn" | "pnp";
      saturationCurrent: number;
      forwardBeta: number;
      reverseBeta?: number;
      /** Forward Early voltage; zero or absent leaves the effect out. */
      earlyVoltage?: number;
    }
  | {
      kind: "mosfet";
      channel: "n" | "p";
      /** SPICE `VTO`, so negative for an enhancement-mode p-channel part. */
      thresholdVoltage: number;
      /** `KP·W/L`, in A/V². */
      transconductance: number;
      channelLengthModulation?: number;
    };

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

/** Settings for a transient run, in seconds. Steps are equal, no longer than `timeStep`, and end at `stopTime`. */
export type TransientOptions = { stopTime: number; timeStep: number };

/** A transient run from switch-on. Every series is sampled at `times`, which start one step in. */
export type TransientSolution = {
  times: number[];
  nodeVoltages: Record<string, number[]>;
  /** Per element, one series per pin, in pin order. */
  pinCurrents: Record<string, number[][]>;
  componentPower: Record<string, number[]>;
  iterations: number;
};

export type TransientError = SolveError | { code: "invalidAnalysis"; reason: string };

export type TransientOutcome =
  | { ok: true; solution: TransientSolution; durationMs: number }
  | { ok: false; error: TransientError; durationMs: number };

/**
 * Settings for an AC small-signal sweep, as SPICE's `.ac dec`. `source` names the voltage or current source driven
 * at 1 V or 1 A; frequencies are in hertz.
 */
export type AcOptions = {
  source: string;
  startFrequency: number;
  stopFrequency: number;
  pointsPerDecade: number;
};

/** A complex amplitude: a signal's size and phase at one frequency, per unit of drive. */
export type Phasor = { re: number; im: number };

/** A small-signal sweep. Every series is sampled at `frequencies`; parts are linearised at `operatingPoint`. */
export type AcSolution = {
  frequencies: number[];
  nodeVoltages: Record<string, Phasor[]>;
  /** Current into the first pin of each voltage source and inductor. */
  branchCurrents: Record<string, Phasor[]>;
  operatingPoint: DcSolution;
};

export type AcOutcome =
  | { ok: true; solution: AcSolution; durationMs: number }
  | { ok: false; error: TransientError; durationMs: number };

/**
 * A phasor's size in decibels, `20·log10|v|`, the usual scale for a frequency response.
 * @param phasor - Complex amplitude per unit of drive.
 * @returns Gain in dB.
 */
export const decibels = ({ re, im }: Phasor): number => 20 * Math.log10(Math.hypot(re, im));

/**
 * A phasor's phase relative to the drive.
 * @param phasor - Complex amplitude per unit of drive.
 * @returns Phase in degrees, from −180 to 180.
 */
export const phaseDegrees = ({ re, im }: Phasor): number => (Math.atan2(im, re) * 180) / Math.PI;

/**
 * A run from switch-on, long enough to show the circuit settle. `solution` is `null` when nothing stores energy, so
 * the circuit reaches its operating point at once; `settled` is `false` when it was still changing at the longest
 * run tried.
 */
export type SwitchOnOutcome =
  | { ok: true; solution: TransientSolution | null; settled: boolean; durationMs: number }
  | { ok: false; error: TransientError; durationMs: number };

/**
 * Narrows an unknown thrown value to a structured solver error.
 * @param value - Anything caught from the WASM boundary.
 * @returns Whether the value carries a known error `code`.
 */
export const isSolveError = (value: unknown): value is SolveError =>
  typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
