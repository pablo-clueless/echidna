import type { ComponentSpec } from "@echidna/core";
import type { ReactNode } from "react";

import {
  BOX_HALF_WIDTH,
  BOX_KINDS,
  boxBounds,
  boxPins,
  isModuleBox,
  moduleBounds,
  GRID,
} from "@/lib/schematic/symbols";
import { switchClosed } from "@/lib/project/model";

const g = (n: number) => n * GRID;

const line = (x1: number, y1: number, x2: number, y2: number) =>
  `M${g(x1)} ${g(y1)}L${g(x2)} ${g(y2)}`;

const twoPinLeads = (inner: number) => `${line(-2, 0, -inner, 0)}${line(inner, 0, 2, 0)}`;

const arrows = [0, 0.45]
  .map(
    (dx) => `${line(0 + dx, -0.7, 0.45 + dx, -1.15)}M${g(0.45 + dx)} ${g(-1.15)}l-5 1.5l3.5 3.5z`,
  )
  .join("");

/** Filled arrowhead with its tip at `tip`, pointing along `(dx, dy)`, in grid units. */
const arrowHead = (tip: [number, number], dx: number, dy: number) => {
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const [back, half] = [0.38, 0.17];
  const base = [tip[0] - ux * back, tip[1] - uy * back];
  const corner = (side: number) =>
    `${g((base[0] ?? 0) - uy * half * side)} ${g((base[1] ?? 0) + ux * half * side)}`;
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
    <path
      d={arrowIn ? arrowHead([-0.38, 0], -1, 0) : arrowHead([0.55, 0], 1, 0)}
      className="fill-current"
    />
  </>
);

/** Glyph paths drawn at rotation 0 around the origin, in pixels. Strokes use `currentColor`. */
const glyphs: Record<string, ReactNode> = {
  resistor: (
    <>
      <path d={twoPinLeads(1)} />
      <rect
        x={g(-1)}
        y={g(-0.35)}
        width={g(2)}
        height={g(0.7)}
        rx={1}
        className="fill-background"
      />
    </>
  ),
  capacitor: (
    <path d={`${twoPinLeads(0.2)}${line(-0.2, -0.65, -0.2, 0.65)}${line(0.2, -0.65, 0.2, 0.65)}`} />
  ),
  inductor: (
    <path
      d={`${twoPinLeads(1)}M${g(-1)} 0${[0, 1, 2, 3].map(() => `a${g(0.25)} ${g(0.25)} 0 0 1 ${g(0.5)} 0`).join("")}`}
    />
  ),
  diode: (
    <>
      <path d={`${twoPinLeads(0.55)}${line(0.55, -0.55, 0.55, 0.55)}`} />
      <path
        d={`M${g(-0.55)} ${g(-0.55)}L${g(0.55)} 0L${g(-0.55)} ${g(0.55)}z`}
        className="fill-background"
      />
    </>
  ),
  led: (
    <>
      <path d={`${twoPinLeads(0.55)}${line(0.55, -0.55, 0.55, 0.55)}`} />
      <path
        d={`M${g(-0.55)} ${g(-0.55)}L${g(0.55)} 0L${g(-0.55)} ${g(0.55)}z`}
        className="fill-background"
      />
      <path d={arrows} className="fill-current" />
    </>
  ),
  supply: (
    <>
      <path d={`${line(0, -2, 0, -1)}${line(0, 1, 0, 2)}`} />
      <circle r={g(1)} className="fill-background" />
      <path
        d={`${line(-0.25, -0.45, 0.25, -0.45)}${line(0, -0.7, 0, -0.2)}${line(-0.25, 0.45, 0.25, 0.45)}`}
      />
    </>
  ),
  ground: (
    <path
      d={`${line(0, -1, 0, 0)}${line(-0.7, 0, 0.7, 0)}${line(-0.45, 0.25, 0.45, 0.25)}${line(-0.2, 0.5, 0.2, 0.5)}`}
    />
  ),
  regulator: (
    <>
      <path d={`${line(-3, 0, -2, 0)}${line(2, 0, 3, 0)}${line(0, 1.25, 0, 2)}`} />
      <rect
        x={g(-2)}
        y={g(-1.25)}
        width={g(4)}
        height={g(2.5)}
        rx={2}
        className="fill-background"
      />
    </>
  ),
  npn: bjt(true),
  pnp: bjt(false),
  nmos: mosfet(true),
  pmos: mosfet(false),
};

/** Pin labels drawn inside boxed symbols, which stay upright regardless of rotation. */
export const innerPinLabels: Record<
  string,
  { text: string; x: number; y: number; anchor: "start" | "middle" | "end" }[]
> = {
  regulator: [
    { text: "IN", x: -1.8, y: 0, anchor: "start" },
    { text: "OUT", x: 1.8, y: 0, anchor: "end" },
    { text: "GND", x: 0, y: 0.95, anchor: "middle" },
  ],
};

/** A module's box, sized by the part, with no leads: modules plug into slots rather than being wired. */
const moduleBox = ({ w, h }: { w: number; h: number }) => (
  <rect
    x={g(-w)}
    y={g(-h)}
    width={g(w * 2)}
    height={g(h * 2)}
    rx={Math.min(2, g(Math.min(w, h)) / 4)}
    className="fill-background"
  />
);

/** A box with a lead to each pin, for dev boards and sensor modules. */
const box = (count: number) => {
  const { w, h } = boxBounds(count);
  return (
    <>
      <path
        d={boxPins(count)
          .map((p) => line(Math.sign(p.x) * w, p.y, p.x, p.y))
          .join("")}
      />
      <rect
        x={g(-w)}
        y={g(-h)}
        width={g(w * 2)}
        height={g(h * 2)}
        rx={2}
        className="fill-background"
      />
    </>
  );
};

type InnerLabel = { text: string; x: number; y: number; anchor: "start" | "middle" | "end" };

/**
 * What a desktop or laptop module's box says inside, by kind: the abbreviations printed on cases and boxes, so not
 * translated.
 */
const moduleLabels: Record<string, string> = {
  motherboard: "ATX",
  laptopBoard: "LAPTOP",
  cpu: "CPU",
  gpu: "GPU",
  memory: "RAM",
  storage: "SSD",
  cooler: "COOLER",
  psu: "PSU",
  battery: "BATT",
  wifi: "WI-FI",
  display: "eDP",
  charger: "DC IN",
};

/**
 * Pin labels drawn inside a symbol, which stay upright regardless of rotation.
 * @param spec - The part spec.
 * @returns Labels in grid units around the symbol's origin; none for symbols without them.
 */
export const innerLabels = (spec: ComponentSpec): InnerLabel[] =>
  spec.module
    ? [{ text: moduleLabels[spec.kind] ?? spec.module.role, x: 0, y: 0, anchor: "middle" }]
    : BOX_KINDS.has(spec.kind)
      ? boxPins(spec.pins.length).map((p, i) => ({
          text: spec.pins[i]?.name ?? "",
          x: p.x < 0 ? -BOX_HALF_WIDTH + 0.3 : BOX_HALF_WIDTH - 0.3,
          y: p.y,
          anchor: p.x < 0 ? "start" : "end",
        }))
      : (innerPinLabels[spec.kind] ?? []);

/** Single-throw switch: two contacts and a lever that touches the right contact when closed. */
const toggle = (closed: boolean) => (
  <>
    <path d={`${twoPinLeads(1)}${closed ? line(-1, 0, 1, 0) : line(-1, 0, 0.85, -0.8)}`} />
    {[-1, 1].map((x) => (
      <circle key={x} cx={g(x)} r={g(0.15)} className="fill-background" />
    ))}
  </>
);

/** Push button: two contacts and a bar on a plunger, held clear of them until pressed. */
const pushButton = (closed: boolean) => {
  const bar = closed ? -0.15 : -0.5;
  return (
    <>
      <path
        d={`${twoPinLeads(1)}${line(-1.1, bar, 1.1, bar)}${line(0, bar, 0, -0.85)}${line(-0.35, -0.85, 0.35, -0.85)}`}
      />
      {[-1, 1].map((x) => (
        <circle key={x} cx={g(x)} r={g(0.15)} className="fill-background" />
      ))}
    </>
  );
};

/**
 * A part's schematic symbol.
 * @param kind - The spec's `kind`.
 * @param variant - The chosen variant, for symbols that show it, such as a switch's position. Defaults to the first.
 */
export const SymbolGlyph = ({
  spec,
  variant,
}: {
  spec: ComponentSpec;
  variant?: string | undefined;
}) => {
  if (isModuleBox(spec)) return moduleBox(moduleBounds(spec));
  if (BOX_KINDS.has(spec.kind)) return box(spec.pins.length);
  if (spec.kind !== "switch") return glyphs[spec.kind] ?? glyphs.resistor;
  const closed = switchClosed(spec, variant);
  return spec.actuation === "momentary" ? pushButton(closed) : toggle(closed);
};

export { boundsOf } from "@/lib/schematic/symbols";
