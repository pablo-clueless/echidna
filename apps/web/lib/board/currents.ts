import type { ComponentSpec, NetlistComponent } from "@echidna/core";

import { pinKey } from "@/lib/project/model";
import type { Routing } from "./routing";

/** Below this, in amperes, a track is treated as carrying no current: solver leakage, not a real flow. */
export const NO_CURRENT = 1e-6;

/**
 * Current along each track. Every net is routed as a tree of connections, so cutting one splits the net in two, and
 * what flows through it is exactly what the parts on the far side take from the copper (Kirchhoff's current law).
 * @param routing - Routed tracks. Tracks without `ends` get no reading.
 * @param currentInto - Current flowing into a part through a pin, by pin key, in amperes.
 * @returns For each track in order, the current from the start of its points towards the end; `0` without `ends`.
 */
export const trackCurrents = (routing: Routing, currentInto: (pin: string) => number): number[] => {
  const neighbours = new Map<string, string[]>();
  for (const { ends } of routing.traces) {
    if (!ends) continue;
    const [a, b] = ends;
    if (neighbours.get(a)?.includes(b)) continue;
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }

  const flows = new Map<string, number>();
  /** Current through the connection from `from` to `to`: what `to` and everything beyond it draws. */
  const flow = (from: string, to: string): number => {
    const key = `${from}>${to}`;
    const known = flows.get(key);
    if (known !== undefined) return known;
    let sum = currentInto(to);
    for (const next of neighbours.get(to) ?? []) if (next !== from) sum += flow(to, next);
    flows.set(key, sum);
    return sum;
  };

  return routing.traces.map(({ ends }) => (ends ? flow(...ends) : 0));
};

/**
 * Looks up solved pin currents by pin key.
 * @param components - The project's parts.
 * @param specs - Part specs by ID, for each part's pin order.
 * @param pinCurrents - Per part, the current into each pin in spec order, as the solver returns them.
 * @returns A lookup giving `0` for pins the solver has no reading for, such as a ground symbol's.
 */
export const pinCurrentLookup = (
  components: readonly NetlistComponent[],
  specs: ReadonlyMap<string, ComponentSpec>,
  pinCurrents: Readonly<Record<string, readonly number[]>>,
): ((pin: string) => number) => {
  const byPin = new Map<string, number>();
  for (const c of components) {
    specs.get(c.specId)?.pins.forEach((p, i) => {
      byPin.set(pinKey({ componentId: c.id, pinId: p.id }), pinCurrents[c.id]?.[i] ?? 0);
    });
  }
  return (pin) => byPin.get(pin) ?? 0;
};

/** Fastest the flow dashes move, in millimetres per second, however large the current. */
const MAX_FLOW_SPEED = 24;

/**
 * How fast the current overlay's dashes move along a track: on a log scale, so a microamp leak and an amp both read,
 * from 3 mm/s at 1 µA to 12 mm/s at 1 mA and 21 mm/s at 1 A.
 * @param current - Current along the track in amperes, signed by direction.
 * @returns Signed speed in mm/s, or `0` below `NO_CURRENT`.
 */
export const flowSpeed = (current: number): number => {
  const magnitude = Math.abs(current);
  if (magnitude < NO_CURRENT) return 0;
  return Math.sign(current) * Math.min(MAX_FLOW_SPEED, 3 + 3 * Math.log10(magnitude / NO_CURRENT));
};
