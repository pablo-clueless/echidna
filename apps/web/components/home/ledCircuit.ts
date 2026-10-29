import type { Severity } from "@echidna/core";

export const SUPPLY_VOLTAGE = 5;
export const LED_FORWARD_VOLTAGE = 2;
export const LED_MAX_CURRENT = 0.02;
export const WARN_RATIO = 0.8;

export const resistorOptions = [1000, 680, 470, 330, 220, 150, 100, 68, 47] as const;

export type LedCircuitResult = {
  current: number;
  ratio: number;
  severity: Severity;
};

const EPSILON = 1e-9;

/**
 * Solves the single-loop LED demo: supply → series resistor → LED with a fixed forward drop.
 * Severity follows the default derating rule: at or above 80% of rated current warns, above 100% fails.
 * @param resistance - Series resistance in ohms.
 * @returns LED current in amps, fraction of the LED's rating, and the verdict.
 */
export const solveLedCircuit = (resistance: number): LedCircuitResult => {
  const current = (SUPPLY_VOLTAGE - LED_FORWARD_VOLTAGE) / resistance;
  const ratio = current / LED_MAX_CURRENT;
  const severity: Severity = ratio > 1 + EPSILON ? "fail" : ratio >= WARN_RATIO - EPSILON ? "warn" : "pass";
  return { current, ratio, severity };
};
