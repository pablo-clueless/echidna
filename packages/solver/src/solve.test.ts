import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { initSync, solverVersion } from "../wasm/solver.js";
import type { Circuit } from "./types";
import { solveNow } from "./solve";

beforeAll(() => {
  initSync({ module: readFileSync(new URL("../wasm/solver_bg.wasm", import.meta.url)) });
});

describe("WASM solver", () => {
  it("reports the crate version", () => {
    expect(solverVersion()).toBe("0.1.0");
  });

  it("returns plain objects keyed by node and element", () => {
    const circuit: Circuit = {
      ground: "gnd",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "gnd"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "out"], resistance: 1000 },
        { id: "R2", kind: "resistor", nodes: ["out", "gnd"], resistance: 1000 },
      ],
    };
    const outcome = solveNow(circuit);
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.solution.nodeVoltages.out).toBeCloseTo(2.5, 6);
    expect(outcome.solution.branchCurrents.R1).toBeCloseTo(2.5e-3, 9);
    expect(outcome.solution.pinCurrents.R1).toHaveLength(2);
  });

  it("surfaces structured errors", () => {
    const outcome = solveNow({
      ground: "gnd",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["a", "gnd"], voltage: 5 },
        { id: "V2", kind: "voltageSource", nodes: ["a", "gnd"], voltage: 3 },
      ],
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "singular" } });
  });

  it("solves the regulator and LED circuit well inside the 100 ms budget", () => {
    const circuit: Circuit = {
      ground: "gnd",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vin", "gnd"], voltage: 5 },
        { id: "U1", kind: "linearRegulator", nodes: ["vin", "vout", "gnd"], outputVoltage: 3.3, dropoutVoltage: 1.1 },
        { id: "R1", kind: "resistor", nodes: ["vout", "a"], resistance: 68 },
        { id: "D1", kind: "diode", nodes: ["a", "gnd"], saturationCurrent: 1e-19, emissionCoefficient: 2 },
      ],
    };
    const outcome = solveNow(circuit);
    if (!outcome.ok) throw new Error(outcome.error.code);
    expect(outcome.solution.nodeVoltages.vout).toBeCloseTo(3.3, 6);
    expect(outcome.durationMs).toBeLessThan(100);
  });
});
