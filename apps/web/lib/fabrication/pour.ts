import { FIDUCIAL, fiducials, MOUNTING_HOLE, mountingHoles } from "@/lib/board/placement";
import { CLEARANCE, type Layer, type Point, VIA_SIZE } from "@/lib/board/routing";
import { type FabBoard, padSize, place } from "./geometry";

/**
 * The ground pour's rules, in millimetres: the gap kept to other nets' copper, the width of the spokes joining a
 * ground pad through its thermal relief, how far the pour stays inside the board edge, and the raster cell its
 * islands are found on.
 */
export const POUR = { clearance: CLEARANCE + 0.05, spoke: 0.4, edge: 0.5, cell: 0.1 } as const;

/** A shape of copper or of a gap, in board millimetres. A segment is a track: a line with round ends `r` wide. */
export type PourShape =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "rect"; x: number; z: number; hw: number; hh: number }
  | { kind: "segment"; a: Point; b: Point; r: number };

/**
 * A ground pour on one copper layer, drawn in order: fill `area`, cut the `thermals` round ground pads, join the pads
 * back with `spokes`, cut the `clears` round every other net's copper, then cut away `islands` that have no way to
 * ground. The layer's own pads and tracks are drawn over it.
 */
export type Pour = {
  area: { hw: number; hh: number };
  thermals: PourShape[];
  spokes: PourShape[];
  clears: PourShape[];
  islands: PourShape[];
};

/** Whether a point lies in a shape. */
const inside = (shape: PourShape, x: number, z: number): boolean => {
  switch (shape.kind) {
    case "circle":
      return (x - shape.x) ** 2 + (z - shape.z) ** 2 <= shape.r ** 2;
    case "rect":
      return Math.abs(x - shape.x) <= shape.hw && Math.abs(z - shape.z) <= shape.hh;
    case "segment": {
      const [[ax, az], [bx, bz]] = [shape.a, shape.b];
      const [dx, dz] = [bx - ax, bz - az];
      const length = dx * dx + dz * dz;
      const t =
        length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length));
      return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 <= shape.r ** 2;
    }
  }
};

/** A shape's bounding box: left, top, right, bottom. */
const bounds = (shape: PourShape): [number, number, number, number] => {
  switch (shape.kind) {
    case "circle":
      return [shape.x - shape.r, shape.z - shape.r, shape.x + shape.r, shape.z + shape.r];
    case "rect":
      return [shape.x - shape.hw, shape.z - shape.hh, shape.x + shape.hw, shape.z + shape.hh];
    case "segment":
      return [
        Math.min(shape.a[0], shape.b[0]) - shape.r,
        Math.min(shape.a[1], shape.b[1]) - shape.r,
        Math.max(shape.a[0], shape.b[0]) + shape.r,
        Math.max(shape.a[1], shape.b[1]) + shape.r,
      ];
  }
};

/** A shape made larger on every side. */
const grow = (shape: PourShape, by: number): PourShape =>
  shape.kind === "rect"
    ? { ...shape, hw: shape.hw + by, hh: shape.hh + by }
    : { ...shape, r: shape.r + by };

/**
 * Plans the ground pour on one copper layer: every part of the board not within `POUR.clearance` of another net's
 * copper becomes ground, and ground pads join it through four spokes so they can still be soldered.
 * @param board - The parts, routing, pad nets and the ground net.
 * @param layer - Which copper layer.
 * @returns The pour, or `undefined` for a board with no ground.
 */
export const planPour = (board: FabBoard, layer: Layer): Pour | undefined => {
  const ground = board.groundNet;
  if (!ground) return undefined;
  const { clearance, spoke, edge, cell } = POUR;
  const own: PourShape[] = [];
  const thermals: PourShape[] = [];
  const spokes: PourShape[] = [];
  const clears: PourShape[] = [];

  for (const part of board.parts) {
    for (const pad of part.footprint.pads) {
      if (layer === "bottom" && pad.drill === undefined) continue;
      const [x, z] = place(part, [pad.x, pad.z]);
      const [w, h] = padSize(pad, part.rotation);
      const shape: PourShape =
        pad.shape === "round"
          ? { kind: "circle", x, z, r: w / 2 }
          : { kind: "rect", x, z, hw: w / 2, hh: h / 2 };
      if (board.padNets?.get(`${part.id}/${pad.pin}`) !== ground) {
        clears.push(grow(shape, clearance));
        continue;
      }
      own.push(shape);
      thermals.push(grow(shape, clearance));
      // Each spoke runs from the pad's centre out past its gap into the pour.
      const [reachX, reachZ] = [w / 2 + clearance + spoke, h / 2 + clearance + spoke];
      for (const [dx, dz] of [
        [reachX, 0],
        [-reachX, 0],
        [0, reachZ],
        [0, -reachZ],
      ] as const)
        spokes.push({ kind: "segment", a: [x, z], b: [x + dx, z + dz], r: spoke / 2 });
    }
  }
  for (const trace of board.routing.traces) {
    if (trace.unrouted || trace.layer !== layer) continue;
    for (let i = 1; i < trace.points.length; i++) {
      const [a, b] = [trace.points[i - 1], trace.points[i]];
      if (!a || !b) continue;
      const segment: PourShape = { kind: "segment", a, b, r: trace.width / 2 };
      if (trace.net === ground) own.push(segment);
      else clears.push(grow(segment, clearance));
    }
  }
  for (const via of board.routing.vias) {
    const shape: PourShape = { kind: "circle", x: via.x, z: via.z, r: VIA_SIZE / 2 };
    if (via.net === ground) own.push(shape);
    else clears.push(grow(shape, clearance));
  }
  // Mounting holes are plated but on no net, and fiducials need bare board round their dot for the camera.
  for (const [x, z] of mountingHoles(board.size))
    clears.push({ kind: "circle", x, z, r: MOUNTING_HOLE.ring + clearance });
  if (layer === "top")
    for (const [x, z] of fiducials(board.size))
      clears.push({ kind: "circle", x, z, r: FIDUCIAL.opening + clearance });

  const area = { hw: board.size.width / 2 - edge, hh: board.size.depth / 2 - edge };
  return {
    area,
    thermals,
    spokes,
    clears,
    islands: islandsOf(area, cell, { thermals, spokes, clears, own }),
  };
};

/**
 * Finds the parts of a pour that touch no ground copper, on a raster: they would be floating copper. Each cell is
 * pour or not as the drawing order makes it, then the pour is flooded from every cell touching ground copper.
 * @returns Rectangles covering each island, a little oversize so no sliver is left at its edges.
 */
const islandsOf = (
  area: { hw: number; hh: number },
  cell: number,
  shapes: { thermals: PourShape[]; spokes: PourShape[]; clears: PourShape[]; own: PourShape[] },
): PourShape[] => {
  const cols = Math.ceil((area.hw * 2) / cell);
  const rows = Math.ceil((area.hh * 2) / cell);
  const grid = new Uint8Array(cols * rows).fill(1);
  const centre = (i: number, j: number): Point => [
    -area.hw + (i + 0.5) * cell,
    -area.hh + (j + 0.5) * cell,
  ];
  const stamp = (shape: PourShape, value: number) => {
    const [left, top, right, bottom] = bounds(shape);
    const [i0, i1] = [
      Math.max(0, Math.floor((left + area.hw) / cell)),
      Math.min(cols - 1, Math.floor((right + area.hw) / cell)),
    ];
    const [j0, j1] = [
      Math.max(0, Math.floor((top + area.hh) / cell)),
      Math.min(rows - 1, Math.floor((bottom + area.hh) / cell)),
    ];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [x, z] = centre(i, j);
        if (inside(shape, x, z)) grid[j * cols + i] = value;
      }
  };
  for (const s of shapes.thermals) stamp(s, 0);
  for (const s of shapes.spokes) stamp(s, 1);
  for (const s of shapes.clears) stamp(s, 0);

  // Flood from pour cells within a cell of ground copper.
  const reached = new Uint8Array(cols * rows);
  const stack: number[] = [];
  for (const s of shapes.own) {
    const near = grow(s, cell);
    const [left, top, right, bottom] = bounds(near);
    for (
      let j = Math.max(0, Math.floor((top + area.hh) / cell));
      j <= Math.min(rows - 1, Math.floor((bottom + area.hh) / cell));
      j++
    )
      for (
        let i = Math.max(0, Math.floor((left + area.hw) / cell));
        i <= Math.min(cols - 1, Math.floor((right + area.hw) / cell));
        i++
      ) {
        const k = j * cols + i;
        const [x, z] = centre(i, j);
        if (grid[k] && !reached[k] && inside(near, x, z)) {
          reached[k] = 1;
          stack.push(k);
        }
      }
  }
  while (stack.length > 0) {
    const k = stack.pop() ?? 0;
    const [i, j] = [k % cols, Math.floor(k / cols)];
    for (const n of [
      i > 0 ? k - 1 : -1,
      i < cols - 1 ? k + 1 : -1,
      j > 0 ? k - cols : -1,
      j < rows - 1 ? k + cols : -1,
    ])
      if (n >= 0 && grid[n] && !reached[n]) {
        reached[n] = 1;
        stack.push(n);
      }
  }

  // Each row's runs of unreached pour, as rectangles a cell oversize so the cut takes the island's ragged edge too.
  const islands: PourShape[] = [];
  for (let j = 0; j < rows; j++) {
    let start = -1;
    for (let i = 0; i <= cols; i++) {
      const floating = i < cols && grid[j * cols + i] === 1 && !reached[j * cols + i];
      if (floating && start < 0) start = i;
      if (!floating && start >= 0) {
        const [x0, z] = centre(start, j);
        const [x1] = centre(i - 1, j);
        islands.push({ kind: "rect", x: (x0 + x1) / 2, z, hw: (x1 - x0) / 2 + cell, hh: cell });
        start = -1;
      }
    }
  }
  return islands;
};
