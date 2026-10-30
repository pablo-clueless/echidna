import type { TransientSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";
import { describe, expect, it } from "vitest";

import { partResponse, pinCurrentsAt } from "./switchOn";

const build = {
  circuit: {
    ground: "0",
    elements: [
      { id: "U1", kind: "linearRegulator", nodes: ["in", "out", "0"], outputVoltage: 3.3 },
      { id: "C1", kind: "capacitor", nodes: ["out", "0"], capacitance: 1e-6 },
    ],
  },
  netNodes: {},
  specs: {},
} satisfies CircuitBuild;

const solution: TransientSolution = {
  times: [1e-6, 2e-6],
  nodeVoltages: { in: [5, 5], out: [3.3, 3.3], "0": [0, 0] },
  pinCurrents: { U1: [[0.02, 0.01], [-0.019, -0.009], [0.001, 0.001]], C1: [[0.019, 0.009], [-0.019, -0.009]] },
  componentPower: { U1: [0, 0], C1: [0, 0] },
  iterations: 4,
};

describe("switch-on series", () => {
  it("reads a two-pin part across its pins and into its first pin", () => {
    expect(partResponse(build, solution, "C1")).toEqual({
      pins: [0, 1],
      voltage: [3.3, 3.3],
      currentPin: 0,
      current: [0.019, 0.009],
      outward: false,
    });
  });

  it("reads a regulator from output to ground, as the current it sources", () => {
    expect(partResponse(build, solution, "U1")).toMatchObject({
      pins: [1, 2],
      voltage: [3.3, 3.3],
      currentPin: 1,
      current: [0.019, 0.009],
      outward: true,
    });
  });

  it("skips parts that were not simulated", () => {
    expect(partResponse(build, solution, "R9")).toBeUndefined();
  });

  it("plays back pin currents at one sample", () => {
    expect(pinCurrentsAt(solution, 1)).toEqual({ U1: [0.01, -0.009, 0.001], C1: [0.009, -0.009] });
  });
});
