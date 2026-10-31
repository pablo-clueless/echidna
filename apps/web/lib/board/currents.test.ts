import { initSync, solveDc } from "@echidna/solver/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DcSolution } from "@echidna/solver/types";
import { partsById, toCircuit } from "@echidna/library";
import { readFileSync } from "node:fs";

import { flowSpeed, NO_CURRENT, pinCurrentLookup, trackCurrents } from "./currents";
import { regulatorExample } from "@/lib/project/example";
import { toNetlist } from "@/lib/project/model";
import type { Routing, Trace } from "./routing";
import { projectCopper } from "./copper";

beforeAll(() => {
  initSync({ module: readFileSync(new URL("../../../../packages/solver/wasm/solver_bg.wasm", import.meta.url)) });
});

const track = (ends: [string, string]): Trace => ({ net: "n", layer: "top", width: 0.4, points: [], ends });

describe("trackCurrents", () => {
  it("carries what the parts beyond each connection draw, signed along the track", () => {
    // A source pin feeds 3 A into a junction at B, which splits 1 A to C and 2 A to D.
    const routing: Routing = { traces: [track(["A", "B"]), track(["C", "B"]), track(["B", "D"])], vias: [] };
    const into: Record<string, number> = { A: -3, C: 1, D: 2 };
    expect(trackCurrents(routing, (pin) => into[pin] ?? 0)).toEqual([3, -1, 2]);
  });

  it("gives tracks without ends no reading", () => {
    const routing: Routing = { traces: [{ net: "n", layer: "top", width: 0.4, points: [] }], vias: [] };
    expect(trackCurrents(routing, () => 1)).toEqual([0]);
  });

  it("matches the LED current on the track feeding it in the example circuit", () => {
    const project = regulatorExample();
    const { routing } = projectCopper(project);
    const solution = solveDc(toCircuit(toNetlist(project), partsById).circuit) as DcSolution;
    const currents = trackCurrents(routing, pinCurrentLookup(project.components, partsById, solution.pinCurrents));
    const led = solution.pinCurrents.D1?.[0] ?? 0;
    expect(led).toBeGreaterThan(1e-3);

    const feeds = routing.traces.flatMap((t, i) =>
      t.ends?.includes("D1/a") ? [t.ends[1] === "D1/a" ? (currents[i] ?? 0) : -(currents[i] ?? 0)] : [],
    );
    expect(feeds.length).toBeGreaterThan(0);
    for (const current of feeds) expect(current).toBeCloseTo(led, 9);
  });
});

describe("flowSpeed", () => {
  it("rises on a log scale, keeps the direction and stops below a microamp", () => {
    expect(flowSpeed(1e-3)).toBeCloseTo(12);
    expect(flowSpeed(-1e-3)).toBeCloseTo(-12);
    expect(flowSpeed(NO_CURRENT / 2)).toBe(0);
    expect(flowSpeed(1e6)).toBe(24);
  });
});
