export const BOARD = { width: 6, depth: 4, thickness: 0.16 } as const;

export type Role = "body" | "top" | "metal" | "gold" | "ceramic" | "lens" | "plastic";
export type Shape = "box" | "round" | "cyl";
export type Vec3 = [number, number, number];

export type Prim = {
  shape: Shape;
  size: Vec3;
  pos: Vec3;
  role: Role;
  accent?: boolean;
};

export type StepKey = "soc" | "memory" | "capacitors" | "resistors" | "usb" | "inductor" | "crystal" | "led" | "header";

export type Step = {
  key: StepKey;
  designator: string;
  centre: Vec3;
  prims: Prim[];
};

type Kind = "qfp" | "soic" | "mlcc" | "resistor" | "usb" | "inductor" | "crystal" | "led" | "header";
type Placement = { kind: Kind; at: [number, number]; turn?: boolean };

const TOP = BOARD.thickness;

const box = (size: Vec3, pos: Vec3, role: Role, accent = false): Prim => ({ shape: "box", size, pos, role, accent });

const pinRow = (count: number, span: number, place: (offset: number) => Prim) =>
  Array.from({ length: count }, (_, i) => place(-span / 2 + (span * i) / Math.max(1, count - 1)));

const qfp = (): Prim[] => {
  const w = 1.5;
  const h = 0.18;
  const span = w * 0.78;
  const pin = (x: number, z: number, along: "x" | "z") =>
    box(along === "x" ? [0.07, 0.04, 0.2] : [0.2, 0.04, 0.07], [x, 0.02, z], "metal");
  return [
    box([w, h, w], [0, h / 2 + 0.02, 0], "body", true),
    box([w * 0.62, 0.012, w * 0.62], [0, h + 0.026, 0], "top"),
    { shape: "cyl", size: [0.07, 0.012, 0.07], pos: [-w * 0.38, h + 0.026, -w * 0.38], role: "top" },
    ...pinRow(8, span, (o) => pin(o, -w / 2 - 0.07, "x")),
    ...pinRow(8, span, (o) => pin(o, w / 2 + 0.07, "x")),
    ...pinRow(8, span, (o) => pin(-w / 2 - 0.07, o, "z")),
    ...pinRow(8, span, (o) => pin(w / 2 + 0.07, o, "z")),
  ];
};

const soic = (): Prim[] => {
  const w = 1.2;
  const d = 0.62;
  const h = 0.16;
  return [
    box([w, h, d], [0, h / 2 + 0.03, 0], "body", true),
    { shape: "cyl", size: [0.06, 0.01, 0.06], pos: [-w * 0.4, h + 0.035, -d * 0.25], role: "top" },
    ...pinRow(5, w * 0.8, (o) => box([0.08, 0.05, 0.22], [o, 0.025, -d / 2 - 0.08], "metal")),
    ...pinRow(5, w * 0.8, (o) => box([0.08, 0.05, 0.22], [o, 0.025, d / 2 + 0.08], "metal")),
  ];
};

const twoTerminal = (body: Role, length: number): Prim[] => [
  box([length * 0.64, 0.14, 0.16], [0, 0.07, 0], body, true),
  box([length * 0.18, 0.15, 0.17], [-length * 0.41, 0.075, 0], "metal"),
  box([length * 0.18, 0.15, 0.17], [length * 0.41, 0.075, 0], "metal"),
];

const usb = (): Prim[] => [
  { shape: "round", size: [0.78, 0.32, 0.92], pos: [0, 0.16, 0], role: "metal", accent: true },
  box([0.02, 0.12, 0.6], [-0.39, 0.16, 0], "plastic"),
];

const inductor = (): Prim[] => [
  { shape: "round", size: [0.62, 0.3, 0.62], pos: [0, 0.15, 0], role: "body", accent: true },
  { shape: "cyl", size: [0.4, 0.012, 0.4], pos: [0, 0.306, 0], role: "top" },
];

const crystal = (): Prim[] => [
  { shape: "round", size: [0.56, 0.13, 0.32], pos: [0, 0.065, 0], role: "metal", accent: true },
];

const led = (): Prim[] => [
  box([0.34, 0.1, 0.24], [0, 0.05, 0], "plastic", true),
  { shape: "cyl", size: [0.16, 0.06, 0.16], pos: [0, 0.13, 0], role: "lens" },
];

const header = (): Prim[] => [
  box([1.5, 0.22, 0.28], [0, 0.11, 0], "body", true),
  ...pinRow(6, 1.25, (o) => box([0.06, 0.55, 0.06], [o, 0.48, 0], "gold")),
];

const kinds: Record<Kind, () => Prim[]> = {
  qfp,
  soic,
  mlcc: () => twoTerminal("ceramic", 0.34),
  resistor: () => twoTerminal("body", 0.32),
  usb,
  inductor,
  crystal,
  led,
  header,
};

const layout: { key: StepKey; designator: string; items: Placement[] }[] = [
  { key: "soc", designator: "U1", items: [{ kind: "qfp", at: [-0.6, 0] }] },
  { key: "memory", designator: "U2", items: [{ kind: "soic", at: [1.55, -0.85] }] },
  {
    key: "capacitors",
    designator: "C1–C4",
    items: [
      { kind: "mlcc", at: [-1.72, -0.5], turn: true },
      { kind: "mlcc", at: [-1.72, 0.5], turn: true },
      { kind: "mlcc", at: [0.52, -0.5], turn: true },
      { kind: "mlcc", at: [0.52, 0.5], turn: true },
    ],
  },
  {
    key: "resistors",
    designator: "R1–R3",
    items: [
      { kind: "resistor", at: [1.15, 0.2] },
      { kind: "resistor", at: [1.75, 0.2] },
      { kind: "resistor", at: [1.85, 1.5] },
    ],
  },
  { key: "usb", designator: "J1", items: [{ kind: "usb", at: [-2.68, 1.1] }] },
  { key: "inductor", designator: "L1", items: [{ kind: "inductor", at: [-1.35, 1.45] }] },
  { key: "crystal", designator: "Y1", items: [{ kind: "crystal", at: [-0.6, -1.4] }] },
  { key: "led", designator: "D1", items: [{ kind: "led", at: [2.3, 1.5] }] },
  { key: "header", designator: "J2", items: [{ kind: "header", at: [1.55, -1.72] }] },
];

const turnPrim = (p: Prim): Prim => ({
  ...p,
  size: [p.size[2], p.size[1], p.size[0]],
  pos: [p.pos[2], p.pos[1], p.pos[0]],
});

/**
 * Resolves the board layout into placement steps, each a group of primitives positioned relative to its centre.
 * @returns Steps in placement order.
 */
export const buildSteps = (): Step[] =>
  layout.map(({ key, designator, items }) => {
    const cx = items.reduce((sum, i) => sum + i.at[0], 0) / items.length;
    const cz = items.reduce((sum, i) => sum + i.at[1], 0) / items.length;
    const prims = items.flatMap(({ kind, at, turn }) =>
      kinds[kind]().map((p) => {
        const placed = turn ? turnPrim(p) : p;
        return { ...placed, pos: [placed.pos[0] + at[0] - cx, placed.pos[1], placed.pos[2] + at[1] - cz] as Vec3 };
      }),
    );
    return { key, designator, centre: [cx, TOP, cz], prims };
  });

export const traces: [number, number, number, number][] = [
  [0.15, 0.2, 1.15, 0.2],
  [1.75, 0.2, 1.75, -0.5],
  [-0.6, -0.9, -0.6, -1.25],
  [-1.35, 0.75, -1.35, 1.15],
  [-1.65, 1.45, -2.25, 1.45],
  [-2.25, 1.45, -2.25, 1.1],
  [-0.3, 0.75, -0.3, 1.0],
  [-0.3, 1.0, 1.85, 1.0],
  [1.85, 1.0, 1.85, 1.5],
  [2.01, 1.5, 2.13, 1.5],
  [0.15, -0.5, 0.95, -0.85],
  [1.55, -1.25, 1.55, -1.55],
  [-2.2, -0.5, -2.2, 0.5],
  [-1.95, -0.5, -2.2, -0.5],
  [-1.95, 0.5, -2.2, 0.5],
];

export const mountingHoles: [number, number][] = [
  [-2.7, -1.7],
  [2.7, -1.7],
  [2.7, 1.7],
];
