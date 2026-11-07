import { describe, expect, it } from "vitest";

import { projectCopper, projectDrills, TRACK_WIDTH } from "./copper";
import { regulatorExample } from "@/lib/project/example";
import { clearanceViolations } from "./clearance";

describe("projectCopper", () => {
  const project = regulatorExample();
  const { drills, routing } = projectCopper(project);

  it("drills every through-hole pin: supply terminal, switch, resistor and LED", () => {
    expect(drills).toHaveLength(8);
  });

  it("places the same holes without routing, for dragging", () => {
    expect(projectDrills(project)).toEqual(drills);
  });

  it("routes each net on the board with one connection fewer than its pins", () => {
    const byNet = new Map<string, Set<string>>();
    for (const trace of routing.traces)
      byNet.set(trace.net, (byNet.get(trace.net) ?? new Set()).add(String(trace.ends)));
    // Supply → SW1; SW1 → U1 in; U1 out → R1 (the tab is the same pin, joined inside the part); R1 → D1 anode; and
    // ground joins D1 cathode, V1− and U1 gnd.
    expect([...byNet.values()].map((ends) => ends.size).sort()).toEqual([1, 1, 1, 1, 2]);
  });

  it("routes the example on its board without shorting nets", () => {
    const onBoard = projectCopper(project);
    expect(onBoard.routing.traces.filter((t) => t.unrouted)).toEqual([]);
    expect(clearanceViolations(onBoard.routing, onBoard.pads)).toEqual([]);
  });

  it("keeps every track of the example on the top layer, where it can be seen, with no vias", () => {
    const onBoard = projectCopper(project);
    expect(onBoard.routing.traces.filter((t) => t.layer === "bottom")).toEqual([]);
    expect(onBoard.routing.vias).toEqual([]);
    expect(onBoard.routing.traces.some((t) => String(t.ends) === "SW1/2,U1/in")).toBe(true);
  });

  it("uses wide tracks for the supply and ground nets", () => {
    expect(new Set(routing.traces.map((t) => t.width))).toEqual(
      new Set([TRACK_WIDTH.power, TRACK_WIDTH.signal]),
    );
  });

  it("leaves unwired pins unrouted", () => {
    const bare = projectCopper({ ...project, wires: [] });
    expect(bare.routing.traces).toEqual([]);
    expect(bare.drills).toHaveLength(8);
  });

  it("joins pins wired to different ground symbols, as the solver does", () => {
    const components = [
      { id: "V1", specId: "dc-supply" },
      { id: "D1", specId: "led-5mm" },
      { id: "GND1", specId: "ground" },
      { id: "GND2", specId: "ground" },
    ];
    const wire = (id: string, a: [string, string], b: [string, string]) => ({
      id,
      a: { componentId: a[0], pinId: a[1] },
      b: { componentId: b[0], pinId: b[1] },
    });
    const wires = [
      wire("w1", ["V1", "pos"], ["D1", "a"]),
      wire("w2", ["V1", "neg"], ["GND1", "gnd"]),
      wire("w3", ["D1", "k"], ["GND2", "gnd"]),
    ];
    const board = {
      V1: { x: -0.02, z: 0, rotation: 0 as const },
      D1: { x: 0.02, z: 0, rotation: 0 as const },
    };
    const { routing } = projectCopper({ components, wires, board });
    expect(new Set(routing.traces.map((t) => t.net)).size).toBe(2);
  });

  it("routes every wired pin of a multi-pin part", () => {
    const components = [
      { id: "V1", specId: "dc-supply" },
      { id: "R1", specId: "resistor" },
      { id: "R2", specId: "resistor" },
      { id: "D1", specId: "led-5mm" },
      { id: "Q1", specId: "npn-2n3904" },
      { id: "GND1", specId: "ground" },
      { id: "GND2", specId: "ground" },
    ];
    const wire = (id: string, a: [string, string], b: [string, string]) => ({
      id,
      a: { componentId: a[0], pinId: a[1] },
      b: { componentId: b[0], pinId: b[1] },
    });
    const wires = [
      wire("w1", ["V1", "pos"], ["R1", "1"]),
      wire("w2", ["V1", "pos"], ["R2", "1"]),
      wire("w3", ["R1", "2"], ["Q1", "b"]),
      wire("w4", ["R2", "2"], ["D1", "a"]),
      wire("w5", ["D1", "k"], ["Q1", "c"]),
      wire("w6", ["Q1", "e"], ["GND2", "gnd"]),
      wire("w7", ["V1", "neg"], ["GND1", "gnd"]),
    ];
    const at = (x: number, z: number) => ({ x, z, rotation: 0 as const });
    const board = {
      V1: at(-0.03, 0),
      R1: at(0, -0.015),
      R2: at(0, 0.015),
      D1: at(0.025, 0.015),
      Q1: at(0.025, -0.015),
    };
    const { routing } = projectCopper({ components, wires, board });
    const ends = routing.traces.flatMap((t) => [t.points[0], t.points.at(-1)]);
    // Q1's pads sit 2.54 mm apart around its centre at x = 25 mm.
    for (const x of [22.46, 25, 27.54]) {
      expect(
        ends.some((p) => Math.abs((p?.[0] ?? 0) - x) < 1e-6 && Math.abs((p?.[1] ?? 0) + 15) < 1e-6),
      ).toBe(true);
    }
  });
});
