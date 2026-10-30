import type { TransientSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";

/** One part's response to switch-on: the voltage between two of its pins and the current at one of them. */
export type PartResponse = {
  /** Pin indices the voltage is measured from and to. */
  pins: [number, number];
  voltage: number[];
  /** Pin index the current is measured at. */
  currentPin: number;
  /** Signed so the settled current reads positive; `outward` when that means current leaving the pin. */
  current: number[];
  outward: boolean;
};

/**
 * Picks the series that describe a part over a switch-on run: the voltage across a two-pin part, from output to
 * ground on a regulator, and from the first pin to the last on a transistor (collector–emitter, drain–source).
 * @param build - Circuit build the run was made from.
 * @param solution - Switch-on run.
 * @param id - Component ID.
 * @returns The part's series, or `undefined` when the part was not simulated.
 */
export const partResponse = (build: CircuitBuild, solution: TransientSolution, id: string): PartResponse | undefined => {
  const element = build.circuit.elements.find((e) => e.id === id);
  const currents = solution.pinCurrents[id];
  if (!element || !currents || element.nodes.length < 2) return undefined;
  const pins: [number, number] = element.kind === "linearRegulator" ? [1, 2] : [0, element.nodes.length - 1];
  const node = (pin: number) => solution.nodeVoltages[element.nodes[pin] ?? ""] ?? [];
  const [from, to] = [node(pins[0]), node(pins[1])];
  const voltage = solution.times.map((_, i) => (from[i] ?? 0) - (to[i] ?? 0));
  const raw = currents[pins[0]] ?? [];
  const outward = (raw.at(-1) ?? 0) < 0;
  return { pins, voltage, currentPin: pins[0], current: outward ? raw.map((i) => -i) : raw, outward };
};

/**
 * Pin currents at one sample of a switch-on run, shaped like a DC solution's, so the 3D view can play it back.
 * @param solution - Switch-on run.
 * @param index - Sample index.
 * @returns Current into each pin by component ID.
 */
export const pinCurrentsAt = (solution: TransientSolution, index: number): Record<string, number[]> =>
  Object.fromEntries(Object.entries(solution.pinCurrents).map(([id, pins]) => [id, pins.map((series) => series[index] ?? 0)]));
