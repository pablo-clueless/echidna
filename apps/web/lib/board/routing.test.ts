import { describe, expect, it } from "vitest";

import { CLEARANCE, type Point, type RoutePad, route, type Trace } from "./routing";
import { clearanceViolations, distance } from "./clearance";

const pad = (net: string, x: number, z: number, throughHole = true): RoutePad => ({ net, x, z, radius: 1, throughHole });
const width = () => 0.4;

const segments = (traces: Trace[]) =>
  traces.flatMap((t) => t.points.slice(1).map((b, i) => [t.points[i] as Point, b] as const));

describe("route", () => {
  it("joins a two-pad net pad to pad on the top layer", () => {
    const { traces, vias } = route([pad("a", -5, -2), pad("a", 6, 3)], width);
    expect(vias).toEqual([]);
    expect(traces).toHaveLength(1);
    const [trace] = traces;
    expect(trace?.layer).toBe("top");
    expect(trace?.points[0]).toEqual([-5, -2]);
    expect(trace?.points.at(-1)).toEqual([6, 3]);
  });

  it("only uses horizontal, vertical and 45° segments", () => {
    const { traces } = route([pad("a", 0, 0), pad("a", 7, 3), pad("a", -4, 9), pad("b", 20, 20), pad("b", 13, -6)], width);
    for (const [[ax, az], [bx, bz]] of segments(traces)) {
      const [dx, dz] = [Math.abs(bx - ax), Math.abs(bz - az)];
      expect(dx < 1e-9 || dz < 1e-9 || Math.abs(dx - dz) < 1e-9).toBe(true);
    }
  });

  it("connects n pads with n − 1 tracks and skips single-pad nets", () => {
    const { traces } = route([pad("a", 0, 0), pad("a", 10, 0), pad("a", 20, 0), pad("b", 5, 5)], width);
    expect(traces).toHaveLength(2);
    expect(traces.every((t) => t.net === "a")).toBe(true);
  });

  it("takes a crossing net to the bottom layer, through vias for surface-mount pads", () => {
    const { traces, vias } = route(
      [pad("a", -10, 0), pad("a", 10, 0), pad("b", 0, -10, false), pad("b", 0, 10, false)],
      width,
    );
    const b = traces.filter((t) => t.net === "b");
    expect(b.some((t) => t.layer === "bottom")).toBe(true);
    expect(vias.filter((v) => v.net === "b")).toHaveLength(2);
  });

  it("needs no vias to drop a through-hole connection to the bottom", () => {
    const { traces, vias } = route([pad("a", -10, 0), pad("a", 10, 0), pad("b", 0, -10), pad("b", 0, 10)], width);
    expect(traces.find((t) => t.net === "b")?.layer).toBe("bottom");
    expect(vias).toEqual([]);
  });

  it("keeps clearance from every other net's pads, tracks and vias", () => {
    const pads = [
      pad("a", -10, 0),
      pad("a", 10, 0),
      pad("b", 0, -10, false),
      pad("b", 0, 10, false),
      pad("c", -6, -6),
      pad("c", 6, 6),
      pad("d", -6, 6, false),
      pad("d", 6, -6, false),
    ];
    const routing = route(pads, width);
    expect(routing.traces.some((t) => t.unrouted)).toBe(false);
    expect(clearanceViolations(routing, pads)).toEqual([]);
  });

  it("does not join pads of the same pin, which the part already connects", () => {
    const tab = { ...pad("out", 0, -3, false), pin: "U1/out" };
    const lead = { ...pad("out", 0, 3, false), pin: "U1/out" };
    const load = { ...pad("out", 10, 3), pin: "R1/1" };
    const { traces } = route([tab, lead, load], width);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.ends).toEqual(["U1/out", "R1/1"]);
  });

  it("leaves a pin from whichever of its pads gives the clearer path", () => {
    // Both pads of U1/out are as close to R1/1, but a keepout sits across the lead's way.
    const lead = { ...pad("out", 0, 5, false), pin: "U1/out" };
    const tab = { ...pad("out", 0, -5, false), pin: "U1/out" };
    const load = { ...pad("out", 10, 0), pin: "R1/1" };
    const { traces, vias } = route([lead, tab, load], width, { keepouts: [{ x: 5, z: 2.5, radius: 2.5 }] });
    expect(vias).toEqual([]);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.points[0]).toEqual([0, -5]);
  });

  it("routes short connections first, so a long run goes round them rather than under the board", () => {
    // A short link across the middle, and a long same-width link whose straight path crosses it.
    const { traces, vias } = route(
      [pad("short", -2, -3), pad("short", -2, 3), pad("long", -12, 0), pad("long", 12, 0)],
      width,
      { bounds: { width: 40, depth: 30 } },
    );
    expect(vias).toEqual([]);
    expect(traces.every((t) => t.layer === "top")).toBe(true);
    expect(traces.find((t) => t.net === "short")?.points).toHaveLength(2);
  });

  it("stays inside the board and out of keepouts", () => {
    const keepout = { x: 0, z: 0, radius: 3 };
    const { traces } = route([pad("a", -8, 0), pad("a", 8, 0)], width, { bounds: { width: 30, depth: 20 }, keepouts: [keepout] });
    for (const [a, b] of segments(traces)) {
      expect(distance([keepout.x, keepout.z], a, b)).toBeGreaterThanOrEqual(keepout.radius + 0.2 + CLEARANCE - 1e-6);
      for (const [x, z] of [a, b]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(15);
        expect(Math.abs(z)).toBeLessThanOrEqual(10);
      }
    }
  });

  it("marks a connection it cannot route as unrouted, without copper", () => {
    // Pad "a" at the origin is walled in on both layers by a ring of keepouts.
    const ring = Array.from({ length: 16 }, (_, k) => ({ x: 4 * Math.cos((k * Math.PI) / 8), z: 4 * Math.sin((k * Math.PI) / 8), radius: 1.2 }));
    const { traces, vias } = route([pad("a", 0, 0), pad("a", 12, 0)], width, { keepouts: ring });
    expect(traces).toEqual([expect.objectContaining({ unrouted: true, points: [[0, 0], [12, 0]] })]);
    expect(vias).toEqual([]);
  });

  it("routes wider nets first, so power keeps the top layer", () => {
    const { traces } = route(
      [pad("signal", -10, 0), pad("signal", 10, 0), pad("power", 0, -10), pad("power", 0, 10)],
      (net) => (net === "power" ? 0.8 : 0.4),
    );
    expect(traces.find((t) => t.net === "power")?.layer).toBe("top");
    expect(traces.find((t) => t.net === "signal")?.layer).toBe("bottom");
  });
});
