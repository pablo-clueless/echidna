import { type ComponentSpec, type Net, type Netlist, type NetlistComponent, type PinRef, withVariant } from "@echidna/core";

export type Rotation = 0 | 90 | 180 | 270;

/** Schematic placement in grid units. */
export type SchematicPlacement = { x: number; y: number; rotation: Rotation };

/** Board placement in metres, on the top copper layer. */
export type BoardPlacement = { x: number; z: number; rotation: Rotation };

/** Board outline in millimetres. */
export type BoardSize = { width: number; depth: number };

export type Wire = { id: string; a: PinRef; b: PinRef };

export type ProjectData = {
  name: string;
  components: NetlistComponent[];
  wires: Wire[];
  schematic: Record<string, SchematicPlacement>;
  board: Record<string, BoardPlacement>;
  boardSize: BoardSize;
  /** Air temperature around the board, in kelvin, that part temperatures are estimated from. */
  ambientTemperature: number;
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
  switch: "SW",
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
 * Reads a part's effective parameter: the instance override, then the chosen variant, then the spec.
 * @param component - Netlist component.
 * @param spec - Its part spec.
 * @param key - Parameter name.
 * @returns The value in SI units, or `undefined` when the part has no such parameter.
 */
export const paramValue = (component: NetlistComponent, spec: ComponentSpec, key: string): number | undefined =>
  component.paramOverrides?.[key] ?? withVariant(spec, component.variant).params[key]?.value;

/**
 * Whether a switch conducts in a given position.
 * @param spec - Switch part spec.
 * @param variant - The chosen position; missing or unknown IDs mean the first.
 * @returns `true` unless that position sets the `closed` parameter to 0.
 */
export const switchClosed = (spec: ComponentSpec, variant?: string): boolean =>
  withVariant(spec, variant).params.closed?.value !== 0;

/**
 * The variant IDs of a switch's two positions.
 * @param spec - Switch part spec.
 * @returns The closed and open positions, or `undefined` for a part without both.
 */
export const switchPositions = (spec: ComponentSpec): { closed: string; open: string } | undefined => {
  const variants = spec.variants ?? [];
  const closed = variants.find((v) => switchClosed(spec, v.id))?.id;
  const open = variants.find((v) => !switchClosed(spec, v.id))?.id;
  return closed && open ? { closed, open } : undefined;
};

/**
 * Lets go of every momentary switch, so a push button held while the project is saved is not still pressed when
 * the project is opened again.
 * @param components - The project's parts.
 * @param specs - Part specs by ID.
 * @returns The parts, with momentary switches back in their first position.
 */
export const releaseMomentary = (
  components: readonly NetlistComponent[],
  specs: ReadonlyMap<string, ComponentSpec>,
): NetlistComponent[] =>
  components.map((c) => {
    if (c.variant === undefined || specs.get(c.specId)?.actuation !== "momentary") return c;
    const { variant: _held, ...released } = c;
    return released;
  });

/** Air temperatures a project can be checked at, in kelvin: −40 °C to 85 °C, the industrial range. */
export const AMBIENT_LIMITS = { min: 233.15, max: 358.15 } as const;

/**
 * Keeps an ambient temperature within `AMBIENT_LIMITS`.
 * @param kelvin - Requested temperature in kelvin.
 * @returns The nearest allowed temperature.
 */
export const clampAmbient = (kelvin: number): number =>
  Math.min(AMBIENT_LIMITS.max, Math.max(AMBIENT_LIMITS.min, kelvin));

/** Device-model internals that are fitted from datasheets rather than chosen by the user, so not shown for editing. */
export const MODEL_PARAMS: ReadonlySet<string> = new Set([
  "saturationCurrent",
  "emissionCoefficient",
  "seriesResistance",
  "contactResistance",
  "reverseBeta",
  "earlyVoltage",
  "transconductance",
  "channelLengthModulation",
  "thermalResistance",
]);
/**
 * The parameters the inspector offers for editing: not model internals, and not those a variant sets, such as a
 * switch's position, which follow the variant picker instead.
 * @param spec - Part spec.
 * @returns Parameter names in spec order.
 */
export const editableParams = (spec: ComponentSpec): string[] =>
  Object.keys(spec.params).filter((key) => !MODEL_PARAMS.has(key) && !spec.variants?.some((v) => v.params?.[key]));
