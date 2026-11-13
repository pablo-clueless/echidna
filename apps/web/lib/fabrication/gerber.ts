import { FIDUCIAL, fiducials, MOUNTING_HOLE, mountingHoles } from "@/lib/board/placement";
import { type FabBoard, type FabPart, padSize, place, toFab } from "./geometry";
import { type Layer, type Point, VIA_SIZE } from "@/lib/board/routing";
import type { SilkShape } from "@/lib/board/footprints";
import { planPour, type PourShape } from "./pour";
import { textStrokes } from "./font";

export { type FabBoard, type FabPart, toFab } from "./geometry";

/** Solder mask opens this much wider than each pad on every side, in millimetres. */
export const MASK_EXPANSION = 0.05;
/** Silkscreen line width, and the height of the designators printed beside each part, in millimetres. */
export const SILK = { width: 0.15, designator: 1 } as const;
/** Board outline line width, in millimetres. */
const OUTLINE_WIDTH = 0.05;

/** A number in millimetres for an aperture definition: up to four decimals, no trailing zeros. */
const mm = (value: number) => String(Number(value.toFixed(4)));
/** A coordinate in the 4.6 format declared in each file's header: millionths of a millimetre. */
const coord = (value: number) => String(Math.round(value * 1e6));

/** Collects one Gerber layer's apertures and drawing, and writes it as RS-274X with X2 file attributes. */
class GerberLayer {
  private apertures = new Map<string, number>();
  private body: string[] = [];
  private selected: number | undefined;

  constructor(
    private readonly fn: string,
    private readonly polarity: "Positive" | "Negative",
  ) {}

  private use(definition: string) {
    let code = this.apertures.get(definition);
    if (code === undefined) {
      // D10 is the first aperture number the format leaves free.
      code = 10 + this.apertures.size;
      this.apertures.set(definition, code);
    }
    if (this.selected !== code) {
      this.body.push(`D${code}*`);
      this.selected = code;
    }
  }

  /** Flashes a round or rectangular pad, its width along x and height along y. */
  flash(shape: "round" | "rect", w: number, h: number, [x, y]: Point) {
    this.use(shape === "round" ? `C,${mm(w)}` : `R,${mm(w)}X${mm(h)}`);
    this.body.push(`X${coord(x)}Y${coord(y)}D03*`);
  }

  /** Switches between adding copper (dark) and taking it away (clear) for what is drawn next. */
  setDark(dark: boolean) {
    this.body.push(dark ? "%LPD*%" : "%LPC*%");
  }

  /** Fills a closed outline. */
  region(points: readonly Point[]) {
    const [first, ...rest] = points;
    if (!first) return;
    this.body.push("G36*", `X${coord(first[0])}Y${coord(first[1])}D02*`);
    for (const [x, y] of rest) this.body.push(`X${coord(x)}Y${coord(y)}D01*`);
    this.body.push("G37*");
  }

  /** Draws a polyline with a round pen. */
  stroke(width: number, points: readonly Point[]) {
    const [first, ...rest] = points;
    if (!first || rest.length === 0) return;
    this.use(`C,${mm(width)}`);
    this.body.push(`X${coord(first[0])}Y${coord(first[1])}D02*`);
    for (const [x, y] of rest) this.body.push(`X${coord(x)}Y${coord(y)}D01*`);
  }

  toString() {
    return [
      "G04 Echidna fabrication output*",
      "%TF.GenerationSoftware,Echidna,Studio*%",
      `%TF.FileFunction,${this.fn}*%`,
      `%TF.FilePolarity,${this.polarity}*%`,
      "%FSLAX46Y46*%",
      "%MOMM*%",
      "%LPD*%",
      "G01*",
      ...[...this.apertures].map(([definition, code]) => `%ADD${code}${definition}*%`),
      ...this.body,
      "M02*",
      "",
    ].join("\n");
  }
}

/** Polylines for a silkscreen shape, in board millimetres. */
const silkLines = (part: FabPart, shape: SilkShape): Point[][] => {
  const at = (x: number, z: number) => place(part, [x, z]);
  switch (shape.kind) {
    case "line":
      return [shape.points.map(([x, z]) => at(x, z))];
    case "rect": {
      const [hw, hh] = [shape.w / 2, shape.h / 2];
      return [
        [
          at(shape.x - hw, shape.z - hh),
          at(shape.x + hw, shape.z - hh),
          at(shape.x + hw, shape.z + hh),
          at(shape.x - hw, shape.z + hh),
          at(shape.x - hw, shape.z - hh),
        ],
      ];
    }
    case "circle": {
      // A flat, such as an LED's cathode side, cuts the circle off at `flatX`.
      const flat = shape.flatX ?? Infinity;
      return [
        Array.from({ length: 65 }, (_, i) => {
          const t = (i / 64) * Math.PI * 2;
          return at(
            shape.x + Math.min(shape.r * Math.cos(t), flat),
            shape.z + shape.r * Math.sin(t),
          );
        }),
      ];
    }
    default:
      return [];
  }
};

/** Draws a pour shape, in the layer's current polarity. */
const drawShape = (layer: GerberLayer, shape: PourShape, fab: (p: Point) => Point) => {
  switch (shape.kind) {
    case "circle":
      layer.flash("round", shape.r * 2, shape.r * 2, fab([shape.x, shape.z]));
      break;
    case "rect":
      layer.flash("rect", shape.hw * 2, shape.hh * 2, fab([shape.x, shape.z]));
      break;
    case "segment":
      layer.stroke(shape.r * 2, [fab(shape.a), fab(shape.b)]);
      break;
  }
};

/**
 * Pours ground over a copper layer, before its pads and tracks are drawn over it, and leaves the layer dark again.
 * Nothing is drawn on a board without ground.
 */
const drawPour = (layer: GerberLayer, board: FabBoard, side: Layer, fab: (p: Point) => Point) => {
  const pour = planPour(board, side);
  if (!pour) return;
  const { hw, hh } = pour.area;
  layer.region(
    (
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
        [-hw, -hh],
      ] as Point[]
    ).map(fab),
  );
  layer.setDark(false);
  for (const shape of pour.thermals) drawShape(layer, shape, fab);
  layer.setDark(true);
  for (const shape of pour.spokes) drawShape(layer, shape, fab);
  layer.setDark(false);
  for (const shape of [...pour.clears, ...pour.islands]) drawShape(layer, shape, fab);
  layer.setDark(true);
};

/**
 * The Gerber layers for a two-layer board: copper, solder mask and paste, silkscreen and outline.
 * @param board - The parts, routing and outline.
 * @returns Each layer's file suffix and content.
 */
export const gerberLayers = (board: FabBoard): { suffix: string; content: string }[] => {
  const fab = toFab(board.size);
  const top = new GerberLayer("Copper,L1,Top", "Positive");
  const bottom = new GerberLayer("Copper,L2,Bot", "Positive");
  const topMask = new GerberLayer("Soldermask,Top", "Negative");
  const bottomMask = new GerberLayer("Soldermask,Bot", "Negative");
  const paste = new GerberLayer("Paste,Top", "Positive");
  const silk = new GerberLayer("Legend,Top", "Positive");
  const outline = new GerberLayer("Profile,NP", "Positive");

  for (const [layer, side] of [
    [top, "top"],
    [bottom, "bottom"],
  ] as const)
    drawPour(layer, board, side, fab);

  for (const part of board.parts) {
    for (const pad of part.footprint.pads) {
      const at = fab(place(part, [pad.x, pad.z]));
      const [w, h] = padSize(pad, part.rotation);
      const [mw, mh] = padSize(pad, part.rotation, MASK_EXPANSION);
      top.flash(pad.shape, w, h, at);
      topMask.flash(pad.shape, mw, mh, at);
      if (pad.drill === undefined) {
        paste.flash(pad.shape, w, h, at);
      } else {
        bottom.flash(pad.shape, w, h, at);
        bottomMask.flash(pad.shape, mw, mh, at);
      }
    }
    for (const shape of part.footprint.silk) {
      if (shape.kind === "dot") {
        silk.flash("round", shape.r * 2, shape.r * 2, fab(place(part, [shape.x, shape.z])));
      } else if (shape.kind === "text") {
        const [cx, cy] = fab(place(part, [shape.x, shape.z]));
        for (const s of textStrokes(shape.text, shape.size, cx, cy)) silk.stroke(SILK.width, s);
      } else {
        for (const line of silkLines(part, shape)) silk.stroke(SILK.width, line.map(fab));
      }
    }
    const [rx, ry] = fab(place(part, [part.footprint.ref.x, part.footprint.ref.z]));
    for (const s of textStrokes(part.id, SILK.designator, rx, ry)) silk.stroke(SILK.width, s);
  }

  for (const trace of board.routing.traces) {
    // An unrouted connection is drawn in the studio as a reminder; it has no copper to make.
    if (trace.unrouted) continue;
    (trace.layer === "top" ? top : bottom).stroke(trace.width, trace.points.map(fab));
  }
  for (const via of board.routing.vias) {
    // Vias stay tented: covered by mask on both sides.
    const at = fab([via.x, via.z]);
    top.flash("round", VIA_SIZE, VIA_SIZE, at);
    bottom.flash("round", VIA_SIZE, VIA_SIZE, at);
  }

  const ring = MOUNTING_HOLE.ring * 2;
  for (const hole of mountingHoles(board.size)) {
    const at = fab(hole);
    for (const layer of [top, bottom]) layer.flash("round", ring, ring, at);
    for (const layer of [topMask, bottomMask])
      layer.flash("round", ring + MASK_EXPANSION * 2, ring + MASK_EXPANSION * 2, at);
  }
  for (const mark of fiducials(board.size)) {
    const at = fab(mark);
    top.flash("round", FIDUCIAL.dot * 2, FIDUCIAL.dot * 2, at);
    topMask.flash("round", FIDUCIAL.opening * 2, FIDUCIAL.opening * 2, at);
  }

  const { width, depth } = board.size;
  outline.stroke(OUTLINE_WIDTH, [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
    [0, 0],
  ]);

  return [
    { suffix: "F_Cu.gtl", content: top.toString() },
    { suffix: "B_Cu.gbl", content: bottom.toString() },
    { suffix: "F_Mask.gts", content: topMask.toString() },
    { suffix: "B_Mask.gbs", content: bottomMask.toString() },
    { suffix: "F_Paste.gtp", content: paste.toString() },
    { suffix: "F_Silkscreen.gto", content: silk.toString() },
    { suffix: "Edge_Cuts.gm1", content: outline.toString() },
  ];
};

/**
 * The plated holes as an Excellon drill file: every through-hole pad, via and mounting hole.
 * @param board - The parts, routing and outline.
 * @returns The file's content, in millimetres from the board's bottom-left corner.
 */
export const drillFile = (board: FabBoard): string => {
  const fab = toFab(board.size);
  const holes: { diameter: number; at: Point }[] = [
    ...board.parts.flatMap((part) =>
      part.footprint.pads.flatMap((pad) =>
        pad.drill === undefined
          ? []
          : [{ diameter: pad.drill, at: fab(place(part, [pad.x, pad.z])) }],
      ),
    ),
    ...board.routing.vias.map((via) => ({ diameter: VIA_SIZE / 2, at: fab([via.x, via.z]) })),
    ...mountingHoles(board.size).map((hole) => ({
      diameter: MOUNTING_HOLE.radius * 2,
      at: fab(hole),
    })),
  ];
  const sizes = [...new Set(holes.map((h) => Number(h.diameter.toFixed(3))))].sort((a, b) => a - b);
  const xy = ([x, y]: Point) => `X${x.toFixed(3)}Y${y.toFixed(3)}`;
  return [
    "M48",
    "; Echidna fabrication output: plated holes",
    "; #@! TF.FileFunction,Plated,1,2,PTH",
    "FMAT,2",
    "METRIC,TZ",
    ...sizes.map((d, i) => `T${i + 1}C${d.toFixed(3)}`),
    "%",
    "G90",
    "G05",
    ...sizes.flatMap((d, i) => [
      `T${i + 1}`,
      ...holes.filter((h) => Number(h.diameter.toFixed(3)) === d).map((h) => xy(h.at)),
    ]),
    "M30",
    "",
  ].join("\n");
};
