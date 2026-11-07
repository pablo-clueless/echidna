import type { ComponentSpec } from "@echidna/core";

import type { Rotation, SchematicPlacement } from "@/lib/project/model";
import { footprints } from "@/lib/board/footprints";

export type Point = { x: number; y: number };

/** Drag-and-drop type for parts dragged from the library onto the schematic. */
export const PART_MIME = "application/x-echidna-part";

/** Pixels per schematic grid unit. */
export const GRID = 20;

const transistorPins = (): Point[] => [
  { x: 1, y: -2 },
  { x: -2, y: 0 },
  { x: 1, y: 2 },
];

/** Pin offsets in grid units at rotation 0, in the same order as the spec's pins. */
const pinOffsets: Record<string, Point[]> = {
  supply: [
    { x: 0, y: -2 },
    { x: 0, y: 2 },
  ],
  ground: [{ x: 0, y: -1 }],
  regulator: [
    { x: -3, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 2 },
  ],
  // Collector or drain at the top, base or gate on the left, emitter or source at the bottom.
  npn: transistorPins(),
  pnp: transistorPins(),
  nmos: transistorPins(),
  pmos: transistorPins(),
};

/**
 * Kinds drawn as a box with a lead per pin, such as dev boards and sensor modules, whose pin counts vary. Desktop,
 * laptop, drone, phone and wearable modules are boxes with no leads, as they plug into slots rather than being wired.
 */
export const BOX_KINDS: ReadonlySet<string> = new Set([
  "devBoard",
  "sensor",
  "motherboard",
  "cpu",
  "gpu",
  "memory",
  "storage",
  "cooler",
  "psu",
  "laptopBoard",
  "battery",
  "wifi",
  "display",
  "charger",
  "droneFrame",
  "droneMotors",
  "droneProps",
  "droneBattery",
  "esc",
  "flightController",
  "droneCamera",
  "phoneBoard",
  "wearableBoard",
  "soc",
  "modem",
  "pmic",
  "phoneBattery",
  "phoneDisplay",
  "phoneCamera",
  "chargingCoil",
  "wearableSensor",
  "haptics",
  "radio",
]);

/** Half the width of a box symbol's body, in grid units; its leads run one unit further out. */
export const BOX_HALF_WIDTH = 4;

/**
 * Pin offsets for a box symbol: the first half of the pins down the left side, the rest down the right, two grid
 * units apart and centred on the origin.
 * @param count - Number of pins.
 * @returns One offset per pin, in spec pin order.
 */
export const boxPins = (count: number): Point[] => {
  const rows = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const left = i < rows;
    const row = left ? i : i - rows;
    return { x: (left ? -1 : 1) * (BOX_HALF_WIDTH + 1), y: (row - (rows - 1) / 2) * 2 };
  });
};

/**
 * Half-extents of a box symbol's body.
 * @param count - Number of pins.
 * @returns Half-width and half-height in grid units.
 */
export const boxBounds = (count: number) => ({
  w: BOX_HALF_WIDTH,
  h: Math.max(1, Math.ceil(count / 2)),
});

/** Smallest and largest half-side of a module's box, in grid units: small enough to tell apart, large enough to read. */
export const MODULE_BOX = { min: 1, max: 7 } as const;

/**
 * Half a module box's side, in grid units, for a part that side long: on a compressed scale, so a part twice the
 * size draws a little under one grid unit larger, and a 3 mm sensor and a 305 mm motherboard both stay readable.
 * @param mm - The part's length on that side, in millimetres.
 * @returns The half-side, to the nearest half grid unit.
 */
export const moduleBoxSide = (mm: number): number =>
  Math.min(
    MODULE_BOX.max,
    Math.max(MODULE_BOX.min, Math.round(1.8 * Math.log2(Math.max(mm, 1) / 2)) / 2),
  );

/**
 * Whether a part draws as a module box: a box with no leads, sized by the part, for parts that plug into slots.
 * @param spec - The part spec.
 * @returns `true` for desktop, laptop, drone, phone and wearable modules.
 */
export const isModuleBox = (spec: Pick<ComponentSpec, "kind" | "pins">): boolean =>
  BOX_KINDS.has(spec.kind) && spec.pins.length === 0;

/**
 * Half-extents of a module's box, from the outline it covers on the board or chassis.
 * @param spec - The part spec.
 * @returns Half-width and half-height in grid units.
 */
export const moduleBounds = (
  spec: Pick<ComponentSpec, "footprintId">,
): { w: number; h: number } => {
  const outline = footprints[spec.footprintId]?.courtyard ?? { w: 40, h: 20 };
  return { w: moduleBoxSide(outline.w), h: moduleBoxSide(outline.h) };
};

const twoPin: Point[] = [
  { x: -2, y: 0 },
  { x: 2, y: 0 },
];

/**
 * Rotates a point clockwise on screen (SVG y points down) in 90° steps.
 * @param p - Point relative to the symbol origin.
 * @param rotation - Clockwise rotation in degrees.
 * @returns The rotated point.
 */
export const rotate = (p: Point, rotation: Rotation): Point => {
  switch (rotation) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
};

/**
 * Absolute grid positions of a symbol's pins.
 * @param kind - The spec's `kind`, which selects the symbol.
 * @param placement - Where the symbol sits and how it is turned.
 * @param pinCount - The spec's number of pins, which sizes box symbols.
 * @returns One point per pin, in spec pin order.
 */
export const pinPositions = (kind: string, placement: SchematicPlacement, pinCount = 0): Point[] =>
  (BOX_KINDS.has(kind) ? boxPins(pinCount) : (pinOffsets[kind] ?? twoPin)).map((offset) => {
    const r = rotate(offset, placement.rotation);
    return { x: placement.x + r.x, y: placement.y + r.y };
  });

/**
 * Orthogonal route between two pins: horizontal first, then vertical.
 * @param a - Start, in grid units.
 * @param b - End, in grid units.
 * @returns Polyline points including both ends.
 */
export const routeWire = (a: Point, b: Point): Point[] =>
  a.x === b.x || a.y === b.y ? [a, b] : [a, { x: b.x, y: a.y }, b];

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/** The parameter shown beside each symbol, such as a resistor's resistance. */
export const valueParam: Record<string, string> = {
  resistor: "resistance",
  capacitor: "capacitance",
  inductor: "inductance",
  supply: "voltage",
  regulator: "outputVoltage",
};

/**
 * Somewhere to drop a part added without a pointer position: right of everything already placed.
 * @param placements - Current schematic placements, each with its symbol's half-width including leads, in grid
 * units; two when omitted, as most two-pin symbols are.
 * @param halfWidth - The new symbol's half-width including leads.
 * @returns A grid position clear of existing symbols.
 */
export const freeSchematicSpot = (
  placements: ReadonlyArray<SchematicPlacement & { halfWidth?: number }>,
  halfWidth = 2,
): Point => {
  if (placements.length === 0) return { x: Math.max(4, halfWidth + 2), y: 4 };
  const right = Math.max(...placements.map((p) => p.x + (p.halfWidth ?? 2)));
  const top = Math.min(...placements.map((p) => p.y));
  return { x: right + 2 + halfWidth, y: top + 2 };
};
