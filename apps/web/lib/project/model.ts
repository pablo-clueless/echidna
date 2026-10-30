import type { ComponentSpec, Net, Netlist, NetlistComponent, PinRef } from "@echidna/core";

export type Rotation = 0 | 90 | 180 | 270;

/** Schematic placement in grid units. */
export type SchematicPlacement = { x: number; y: number; rotation: Rotation };

/** Board placement in metres, on the top copper layer. */
export type BoardPlacement = { x: number; z: number; rotation: Rotation };

export type Wire = { id: string; a: PinRef; b: PinRef };

export type ProjectData = {
  name: string;
  components: NetlistComponent[];
  wires: Wire[];
  schematic: Record<string, SchematicPlacement>;
  board: Record<string, BoardPlacement>;
};

const prefixes: Record<string, string> = {
  supply: "V",
  ground: "GND",
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  led: "D",
  diode: "D",
  regulator: "U",
  npn: "Q",
  pnp: "Q",
  nmos: "Q",
  pmos: "Q",
};

/**
 * Picks the next free reference designator for a part kind, such as `R3` after `R1` and `R2`.
 * @param kind - The spec's `kind`.
 * @param taken - IDs already in the project.
 * @returns A designator that is not in `taken`.
 */
export const nextDesignator = (kind: string, taken: Iterable<string>): string => {
  const prefix = prefixes[kind] ?? "X";
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export const pinKey = (pin: PinRef): string => `${pin.componentId}/${pin.pinId}`;

export const samePin = (a: PinRef, b: PinRef): boolean => a.componentId === b.componentId && a.pinId === b.pinId;

/**
 * Groups wired pins into nets. Each net's ID is derived from its alphabetically first pin, so it stays
 * stable while unrelated wiring changes.
 * @param wires - Pin-to-pin wires.
 * @returns One net per connected group of two or more pins.
 */
export const deriveNets = (wires: readonly Wire[]): Net[] => {
  const parent = new Map<string, string>();
  const pins = new Map<string, PinRef>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(k, root);
    return root;
  };
  const add = (pin: PinRef) => {
    const k = pinKey(pin);
    if (!parent.has(k)) {
      parent.set(k, k);
      pins.set(k, pin);
    }
    return k;
  };
  for (const w of wires) {
    const [a, b] = [find(add(w.a)), find(add(w.b))];
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }

  const groups = new Map<string, PinRef[]>();
  for (const k of [...pins.keys()].sort()) {
    const root = find(k);
    groups.set(root, [...(groups.get(root) ?? []), pins.get(k) as PinRef]);
  }
  return [...groups.entries()].map(([root, members]) => ({ id: `net:${root}`, pins: members }));
};

/**
 * The electrical model the solver and rule engine see.
 * @param project - Project data from the store.
 * @returns A netlist with nets derived from wires.
 */
export const toNetlist = (project: Pick<ProjectData, "components" | "wires">): Netlist => ({
  components: project.components,
  nets: deriveNets(project.wires),
  groundNetId: "",
});

/**
 * Finds the net a pin belongs to.
 * @param nets - Derived nets.
 * @param pin - Pin to look up.
 * @returns The net, or `undefined` when the pin is unconnected.
 */
export const netOfPin = (nets: readonly Net[], pin: PinRef): Net | undefined =>
  nets.find((n) => n.pins.some((p) => samePin(p, pin)));

/**
 * Reads a part's effective parameter, preferring the instance override.
 * @param component - Netlist component.
 * @param spec - Its part spec.
 * @param key - Parameter name.
 * @returns The value in SI units, or `undefined` when the part has no such parameter.
 */
export const paramValue = (component: NetlistComponent, spec: ComponentSpec, key: string): number | undefined =>
  component.paramOverrides?.[key] ?? spec.params[key]?.value;

/** Device-model internals that are fitted from datasheets rather than chosen by the user, so not shown for editing. */
export const MODEL_PARAMS: ReadonlySet<string> = new Set([
  "saturationCurrent",
  "emissionCoefficient",
  "seriesResistance",
  "reverseBeta",
  "earlyVoltage",
  "transconductance",
  "channelLengthModulation",
]);