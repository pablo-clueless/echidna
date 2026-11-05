import type { Rotation, SchematicPlacement } from "@/lib/project/model";

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

/** Kinds drawn as a box with a lead per pin, such as dev boards and sensor modules, whose pin counts vary. */
export const BOX_KINDS: ReadonlySet<string> = new Set(["devBoard", "sensor"]);

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
export const boxBounds = (count: number) => ({ w: BOX_HALF_WIDTH, h: Math.max(1, Math.ceil(count / 2)) });

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

export const nextRotation = (r: Rotation): Rotation => (((r + 90) % 360) as Rotation);

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
