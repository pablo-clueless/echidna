/** Clearance checking for routed copper, used by tests to prove a routing shorts no nets. Board millimetres. */

import { CLEARANCE, type Point, type RoutePad, type Routing, VIA_SIZE } from "./routing";

/** Distance from a point to a segment. */
export const distance = ([px, pz]: Point, [ax, az]: Point, [bx, bz]: Point) => {
  const [dx, dz] = [bx - ax, bz - az];
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

/**
 * Pairs of copper on different nets closer than `CLEARANCE`, with a little slack for diagonal grid steps. Segment to
 * segment distance is sampled along each segment, which is exact enough at these sizes. Pad pairs are skipped: their
 * spacing is the footprint's, and pads are modelled as circles that can overlap where the real rectangles do not.
 */
export const clearanceViolations = (routing: Routing, pads: RoutePad[]) => {
  type Shape = { net: string; layer: "top" | "bottom"; a: Point; b: Point; r: number; kind: string };
  const shapes: Shape[] = [];
  for (const t of routing.traces) {
    if (t.unrouted) continue;
    t.points.slice(1).forEach((b, i) => shapes.push({ net: t.net, layer: t.layer, a: t.points[i] as Point, b, r: t.width / 2, kind: "track" }));
  }
  for (const v of routing.vias) {
    for (const layer of ["top", "bottom"] as const) shapes.push({ net: v.net, layer, a: [v.x, v.z], b: [v.x, v.z], r: VIA_SIZE / 2, kind: "via" });
  }
  for (const p of pads) {
    shapes.push({ net: p.net, layer: "top", a: [p.x, p.z], b: [p.x, p.z], r: p.radius, kind: "pad" });
    if (p.throughHole) shapes.push({ net: p.net, layer: "bottom", a: [p.x, p.z], b: [p.x, p.z], r: p.radius, kind: "pad" });
  }
  const gap = (s: Shape, u: Shape) => {
    let best = Infinity;
    for (let k = 0; k <= 50; k++) {
      const t = k / 50;
      const p: Point = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      best = Math.min(best, distance(p, u.a, u.b));
    }
    return best - s.r - u.r;
  };
  const found: string[] = [];
  shapes.forEach((s, i) =>
    shapes.slice(i + 1).forEach((u) => {
      if (s.net !== u.net && s.layer === u.layer && (s.kind !== "pad" || u.kind !== "pad") && gap(s, u) < CLEARANCE - 0.13) found.push(`${s.kind} ${s.net} [${s.a.map((v) => v.toFixed(2))}] / ${u.kind} ${u.net} [${u.a.map((v) => v.toFixed(2))}] on ${s.layer}`);
    }),
  );
  return found;
};
