import type { DcSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";

/** Rated current the 3D view's brightness is scaled to, in amperes. */
export const LED_NOMINAL_CURRENT = 0.02;
/** Below this current (0.25 % of rated, about 50 µA) an LED gives no visible light. */
export const LED_LIT_CURRENT = 50e-6;
/** Reverse voltage beyond which an unlit LED is reported as wired backwards rather than starved of current. */
const REVERSED_VOLTAGE = 0.1;

export type LedState =
  | { lit: true; current: number }
  /**
   * Why an LED is dark: a lead has no wire; both leads are on the same net, so current bypasses it; it is wired
   * backwards; or it has no complete path, or too little voltage, to conduct.
   */
  | { lit: false; reason: "unwired" | "shorted" | "reversed" | "open" };

/**
 * Whether a solved LED gives light, and if not, why.
 * @param build - Circuit built for the solve.
 * @param solution - Its DC operating point.
 * @param id - The LED's component ID.
 * @returns The LED's state, or `undefined` when it was not part of the solve.
 */
export const ledState = (build: CircuitBuild, solution: DcSolution, id: string): LedState | undefined => {
  const element = build.circuit.elements.find((e) => e.id === id);
  if (!element) return undefined;
  const [anode = "", cathode = ""] = element.nodes;
  const current = solution.pinCurrents[id]?.[0] ?? 0;
  if (current >= LED_LIT_CURRENT) return { lit: true, current };
  // Unconnected pins get a node of their own, named after the pin, so the solve still runs.
  if (anode.startsWith("p:") || cathode.startsWith("p:")) return { lit: false, reason: "unwired" };
  if (anode === cathode) return { lit: false, reason: "shorted" };
  const forward = (solution.nodeVoltages[anode] ?? 0) - (solution.nodeVoltages[cathode] ?? 0);
  return { lit: false, reason: forward < -REVERSED_VOLTAGE ? "reversed" : "open" };
};
