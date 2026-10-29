import type { ReactNode } from "react";

import { GRID } from "@/lib/schematic/symbols";

const g = (n: number) => n * GRID;

const line = (x1: number, y1: number, x2: number, y2: number) => `M${g(x1)} ${g(y1)}L${g(x2)} ${g(y2)}`;

const twoPinLeads = (inner: number) => `${line(-2, 0, -inner, 0)}${line(inner, 0, 2, 0)}`;

const arrows = [0, 0.45]
  .map((dx) => `${line(0 + dx, -0.7, 0.45 + dx, -1.15)}M${g(0.45 + dx)} ${g(-1.15)}l-5 1.5l3.5 3.5z`)
  .join("");

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
};

/** Pin labels drawn inside boxed symbols, which stay upright regardless of rotation. */
export const innerPinLabels: Record<string, { text: string; x: number; y: number; anchor: "start" | "middle" | "end" }[]> = {
  regulator: [
    { text: "IN", x: -1.8, y: 0, anchor: "start" },
    { text: "OUT", x: 1.8, y: 0, anchor: "end" },
    { text: "GND", x: 0, y: 0.95, anchor: "middle" },
  ],
};

export const SymbolGlyph = ({ kind }: { kind: string }) => glyphs[kind] ?? glyphs.resistor;

/** Half-extents of each symbol's body in grid units at rotation 0, for hit areas and selection outlines. */
export const symbolBounds: Record<string, { w: number; h: number }> = {
  resistor: { w: 2, h: 0.8 },
  capacitor: { w: 2, h: 0.8 },
  inductor: { w: 2, h: 0.6 },
  diode: { w: 2, h: 0.8 },
  led: { w: 2, h: 1.3 },
  supply: { w: 1.1, h: 2 },
  ground: { w: 0.8, h: 1 },
  regulator: { w: 3, h: 2 },
};
