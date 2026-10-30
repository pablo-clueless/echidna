import { describe, expect, it } from "vitest";

import { type RoutePad, route, type Trace } from "./routing";

const pad = (net: string, x: number, z: number, throughHole = true): RoutePad => ({ net, x, z, radius: 1, throughHole });
const width = () => 0.4;

const segments = (traces: Trace[]) =>
  traces.flatMap((t) => t.points.slice(1).map((b, i) => [t.points[i] as [number, number], b] as const));

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

  it("routes wider nets first, so power keeps the top layer", () => {
    const { traces } = route(
      [pad("signal", -10, 0), pad("signal", 10, 0), pad("power", 0, -10), pad("power", 0, 10)],
      (net) => (net === "power" ? 0.8 : 0.4),
    );
    expect(traces.find((t) => t.net === "power")?.layer).toBe("top");
    expect(traces.find((t) => t.net === "signal")?.layer).toBe("bottom");
  });
});
