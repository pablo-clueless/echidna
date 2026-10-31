/** Automatic two-layer routing for the 3D board preview. Lengths in board millimetres, x across and z deep. */

export type Layer = "top" | "bottom";
export type Point = [number, number];

/**
 * A pad to connect. Through-hole pads reach both layers; surface-mount pads only the top. `pin` identifies the part
 * pin the pad belongs to, so tracks can say which pads they join.
 */
export type RoutePad = { net: string; x: number; z: number; radius: number; throughHole: boolean; pin?: string };
/**
 * A copper track. `ends` names the pins of the connection it is part of, the first at the end where `points`
 * starts, when both pads have a `pin`. A connection can take more than one track, such as a stub to a via.
 */
export type Trace = { net: string; layer: Layer; width: number; points: Point[]; ends?: [string, string] };
export type Via = { net: string; x: number; z: number };
export type Routing = { traces: Trace[]; vias: Via[] };

/** Copper-to-copper gap kept between nets. */
export const CLEARANCE = 0.25;
/** Via pad diameter; the drill is half of it. */
export const VIA_SIZE = 0.8;

type Segment = { a: Point; b: Point; half: number; net: string; layer: Layer };
type Candidate = { traces: Trace[]; vias: Via[]; cost: number };

const distanceToSegment = ([px, pz]: Point, [ax, az]: Point, [bx, bz]: Point) => {
  const [dx, dz] = [bx - ax, bz - az];
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

const segmentsDistance = (a: Point, b: Point, c: Point, d: Point) => {
  const [d1, d2, d3, d4] = [cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)];
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
};

/** A 45° dogleg from `a` to `b`: diagonal then straight, or straight then diagonal. */
const dogleg = (a: Point, b: Point, diagonalFirst: boolean): Point[] => {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const d = Math.min(Math.abs(dx), Math.abs(dz));
  const diagonal: Point = [Math.sign(dx) * d, Math.sign(dz) * d];
  const bend: Point = diagonalFirst ? [a[0] + diagonal[0], a[1] + diagonal[1]] : [b[0] - diagonal[0], b[1] - diagonal[1]];
  const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
  return same(bend, a) || same(bend, b) ? [a, b] : [a, bend, b];
};

const pathLength = (points: Point[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - (points[i]?.[0] ?? 0), p[1] - (points[i]?.[1] ?? 0)), 0);

/** Pairs of pad indices forming a minimum spanning tree by straight-line distance (Prim). */
const spanningTree = (pads: RoutePad[]): [number, number][] => {
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < pads.length) {
    let best: [number, number, number] | null = null;
    for (const i of inTree) {
      for (let j = 0; j < pads.length; j++) {
        if (inTree.has(j)) continue;
        const [p, q] = [pads[i] as RoutePad, pads[j] as RoutePad];
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (!best || d < best[2]) best = [i, j, d];
      }
    }
    if (!best) break;
    edges.push([best[0], best[1]]);
    inTree.add(best[1]);
  }
  return edges;
};

/**
 * Routes every net as a minimum spanning tree of 45° tracks. Each connection tries both dogleg shapes on both
 * layers and keeps the one with fewest clashes against other nets' copper, preferring the top layer. A bottom-layer
 * track to a surface-mount pad drops through a via beside the pad. This is a visual preview, not a checked layout:
 * a clash that no option avoids is kept rather than left unrouted.
 * @param pads - Pads with their nets.
 * @param widthOf - Track width for a net.
 * @returns Tracks and vias.
 */
export const route = (pads: RoutePad[], widthOf: (net: string) => number): Routing => {
  const byNet = new Map<string, RoutePad[]>();
  for (const pad of pads) byNet.set(pad.net, [...(byNet.get(pad.net) ?? []), pad]);
  const nets = [...byNet.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([a, x], [b, y]) => widthOf(b) - widthOf(a) || y.length - x.length || a.localeCompare(b));

  const segments: Segment[] = [];
  const vias: Via[] = [];
  const traces: Trace[] = [];

  const clashes = (points: Point[], layer: Layer, net: string, half: number, ends: RoutePad[]) => {
    let count = 0;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1] as Point, points[i] as Point];
      for (const s of segments) {
        if (s.net !== net && s.layer === layer && segmentsDistance(a, b, s.a, s.b) < half + s.half + CLEARANCE) count++;
      }
      for (const pad of pads) {
        if (pad.net === net || ends.includes(pad) || (layer === "bottom" && !pad.throughHole)) continue;
        if (distanceToSegment([pad.x, pad.z], a, b) < pad.radius + half + CLEARANCE) count++;
      }
      for (const via of vias) {
        if (via.net !== net && distanceToSegment([via.x, via.z], a, b) < VIA_SIZE / 2 + half + CLEARANCE) count++;
      }
    }
    return count;
  };

  for (const [net, members] of nets) {
    const width = widthOf(net);
    const half = width / 2;
    for (const [i, j] of spanningTree(members)) {
      const [from, to] = [members[i] as RoutePad, members[j] as RoutePad];
      const candidates: Candidate[] = [];
      for (const layer of ["top", "bottom"] as const) {
        // On the bottom, a surface-mount end needs a via just outside its pad, joined to it on top.
        const exit = (pad: RoutePad, toward: RoutePad): { at: Point; via?: Via } => {
          if (layer === "top" || pad.throughHole) return { at: [pad.x, pad.z] };
          const [dx, dz] = [toward.x - pad.x, toward.z - pad.z];
          const length = Math.hypot(dx, dz) || 1;
          const reach = pad.radius + VIA_SIZE / 2 + CLEARANCE;
          const at: Point = [pad.x + (dx / length) * reach, pad.z + (dz / length) * reach];
          return { at, via: { net, x: at[0], z: at[1] } };
        };
        const [start, end] = [exit(from, to), exit(to, from)];
        const ends = (k: number): Pick<Trace, "ends"> =>
          from.pin && to.pin ? { ends: k === 0 ? [from.pin, to.pin] : [to.pin, from.pin] } : {};
        const stubs = [start, end].flatMap((e, k) => {
          const pad = k === 0 ? from : to;
          return e.via ? [{ net, layer: "top" as const, width, points: [[pad.x, pad.z], e.at] as Point[], ...ends(k) }] : [];
        });
        const newVias = [start.via, end.via].filter((v): v is Via => v !== undefined);
        for (const diagonalFirst of [true, false]) {
          const points = dogleg(start.at, end.at, diagonalFirst);
          const conflicts =
            clashes(points, layer, net, half, [from, to]) +
            stubs.reduce((n, s) => n + clashes(s.points, "top", net, half, [from, to]), 0);
          candidates.push({
            traces: [...stubs, { net, layer, width, points, ...ends(0) }],
            vias: newVias,
            cost: conflicts * 1000 + newVias.length * 5 + (layer === "bottom" ? 2 : 0) + pathLength(points) * 0.01,
          });
        }
      }
      const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
      for (const trace of best.traces) {
        traces.push(trace);
        for (let k = 1; k < trace.points.length; k++) {
          segments.push({ a: trace.points[k - 1] as Point, b: trace.points[k] as Point, half, net, layer: trace.layer });
        }
      }
      vias.push(...best.vias);
    }
  }
  return { traces, vias };
};
