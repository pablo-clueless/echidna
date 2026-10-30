import type { ReactNode } from "react";

import { GRID } from "@/lib/schematic/symbols";

const g = (n: number) => n * GRID;

const line = (x1: number, y1: number, x2: number, y2: number) => `M${g(x1)} ${g(y1)}L${g(x2)} ${g(y2)}`;

const twoPinLeads = (inner: number) => `${line(-2, 0, -inner, 0)}${line(inner, 0, 2, 0)}`;

const arrows = [0, 0.45]
  .map((dx) => `${line(0 + dx, -0.7, 0.45 + dx, -1.15)}M${g(0.45 + dx)} ${g(-1.15)}l-5 1.5l3.5 3.5z`)
  .join("");

/** Filled arrowhead with its tip at `tip`, pointing along `(dx, dy)`, in grid units. */
const arrowHead = (tip: [number, number], dx: number, dy: number) => {
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const [back, half] = [0.38, 0.17];
  const base = [tip[0] - ux * back, tip[1] - uy * back];
  const corner = (side: number) => `${g((base[0] ?? 0) - uy * half * side)} ${g((base[1] ?? 0) + ux * half * side)}`;
  return `M${g(tip[0])} ${g(tip[1])}L${corner(1)}L${corner(-1)}z`;
};

/** Bipolar transistor: base bar on the left, collector up and emitter down; the arrow sits on the emitter. */
const bjt = (arrowOut: boolean) => {
  const emitter = { from: [-0.5, 0.35] as const, to: [1, 1.1] as const };
  const [dx, dy] = [emitter.to[0] - emitter.from[0], emitter.to[1] - emitter.from[1]];
  const arrow = arrowOut
    ? arrowHead([emitter.from[0] + dx * 0.8, emitter.from[1] + dy * 0.8], dx, dy)
    : arrowHead([emitter.from[0] + dx * 0.25, emitter.from[1] + dy * 0.25], -dx, -dy);
  return (
    <>
      <circle cx={g(0.3)} r={g(1.45)} className="fill-background" />
      <path
        d={`${line(-2, 0, -0.5, 0)}${line(-0.5, -0.75, -0.5, 0.75)}${line(-0.5, -0.35, 1, -1.1)}${line(1, -1.1, 1, -2)}${line(...emitter.from, ...emitter.to)}${line(1, 1.1, 1, 2)}`}
      />
      <path d={arrow} className="fill-current" />
    </>
  );
};

/** Enhancement MOSFET with the body tied to the source: broken channel, insulated gate, and the body arrow. */
const mosfet = (arrowIn: boolean) => (
  <>
    <circle cx={g(0.3)} r={g(1.45)} className="fill-background" />
    <path
      d={[
        line(-2, 0, -0.75, 0),
        line(-0.75, -0.7, -0.75, 0.7),
        line(-0.4, -0.85, -0.4, -0.45),
        line(-0.4, -0.2, -0.4, 0.2),
        line(-0.4, 0.45, -0.4, 0.85),
        line(-0.4, -0.65, 1, -0.65),
        line(1, -0.65, 1, -2),
        line(-0.4, 0.65, 1, 0.65),
        line(1, 0.65, 1, 2),
        line(-0.4, 0, 1, 0),
        line(1, 0, 1, 0.65),
      ].join("")}
    />
    <path d={arrowIn ? arrowHead([-0.38, 0], -1, 0) : arrowHead([0.55, 0], 1, 0)} className="fill-current" />
  </>
);

/** Glyph paths drawn at rotation 0 around the origin, in pixels. Strokes use `currentColor`. */
const glyphs: Record<string, ReactNode> = {
  resistor: (
    <>
      <path d={twoPinLeads(1)} />
      <rect x={g(-1)} y={g(-0.35)} width={g(2)} height={g(0.7)} rx={1} className="fill-background" />
    </>
  ),
  capacitor: <path d={`${twoPinLeads(0.2)}${line(-0.2, -0.65, -0.2, 0.65)}${line(0.2, -0.65, 0.2, 0.65)}`} />,
  inductor: (
    <path
      d={`${twoPinLeads(1)}M${g(-1)} 0${[0, 1, 2, 3].map(() => `a${g(0.25)} ${g(0.25)} 0 0 1 ${g(0.5)} 0`).join("")}`}
    />
  ),
  diode: (
    <>
      <path d={`${twoPinLeads(0.55)}${line(0.55, -0.55, 0.55, 0.55)}`} />
      <path d={`M${g(-0.55)} ${g(-0.55)}L${g(0.55)} 0L${g(-0.55)} ${g(0.55)}z`} className="fill-background" />
    </>
  ),
  led: (
    <>
      <path d={`${twoPinLeads(0.55)}${line(0.55, -0.55, 0.55, 0.55)}`} />
      <path d={`M${g(-0.55)} ${g(-0.55)}L${g(0.55)} 0L${g(-0.55)} ${g(0.55)}z`} className="fill-background" />
      <path d={arrows} className="fill-current" />
    </>
  ),
  supply: (
    <>
      <path d={`${line(0, -2, 0, -1)}${line(0, 1, 0, 2)}`} />
      <circle r={g(1)} className="fill-background" />
      <path d={`${line(-0.25, -0.45, 0.25, -0.45)}${line(0, -0.7, 0, -0.2)}${line(-0.25, 0.45, 0.25, 0.45)}`} />
    </>
  ),
  ground: <path d={`${line(0, -1, 0, 0)}${line(-0.7, 0, 0.7, 0)}${line(-0.45, 0.25, 0.45, 0.25)}${line(-0.2, 0.5, 0.2, 0.5)}`} />,
  regulator: (
    <>
      <path d={`${line(-3, 0, -2, 0)}${line(2, 0, 3, 0)}${line(0, 1.25, 0, 2)}`} />
      <rect x={g(-2)} y={g(-1.25)} width={g(4)} height={g(2.5)} rx={2} className="fill-background" />
    </>
  ),
  npn: bjt(true),
  pnp: bjt(false),
  nmos: mosfet(true),
  pmos: mosfet(false),
};

/** Pin labels drawn inside boxed symbols, which stay upright regardless of rotation. */
export const innerPinLabels: Record<string, { text: string; x: number; y: number; anchor: "start" | "middle" | "end" }[]> = {
  regulator: [
    { text: "IN", x: -1.8, y: 0, anchor: "start" },
    { text: "OUT", x: 1.8, y: 0, anchor: "end" },
    { text: "GND", x: 0, y: 0.95, anchor: "middle" },
  ],
};

/** Single-throw switch: two contacts and a lever that touches the right contact when closed. */
const toggle = (closed: boolean) => (
  <>
    <path d={`${twoPinLeads(1)}${closed ? line(-1, 0, 1, 0) : line(-1, 0, 0.85, -0.8)}`} />
    {[-1, 1].map((x) => (
      <circle key={x} cx={g(x)} r={g(0.15)} className="fill-background" />
    ))}
  </>
);

/**
 * A part's schematic symbol.
 * @param kind - The spec's `kind`.
 * @param variant - The chosen variant, for symbols that show it, such as a switch's position. Defaults to the first.
 */
export const SymbolGlyph = ({ kind, variant }: { kind: string; variant?: string | undefined }) =>
  kind === "switch" ? toggle(variant !== "open") : (glyphs[kind] ?? glyphs.resistor);

/** Half-extents of each symbol's body in grid units at rotation 0, for hit areas and selection outlines. */
export const symbolBounds: Record<string, { w: number; h: number }> = {
  resistor: { w: 2, h: 0.8 },
  capacitor: { w: 2, h: 0.8 },
  inductor: { w: 2, h: 0.6 },
  switch: { w: 2, h: 0.9 },
  diode: { w: 2, h: 0.8 },
  led: { w: 2, h: 1.3 },
  supply: { w: 1.1, h: 2 },
  ground: { w: 0.8, h: 1 },
  regulator: { w: 3, h: 2 },
  npn: { w: 2, h: 2 },
  pnp: { w: 2, h: 2 },
  nmos: { w: 2, h: 2 },
  pmos: { w: 2, h: 2 },
};
