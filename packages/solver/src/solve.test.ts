import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { settleTime, solveNow, solveSwitchOnNow, solveTransientNow, SWITCH_ON_STEPS } from "./solve";
import { initSync, solverVersion } from "../wasm/solver.js";
import type { Circuit } from "./types";

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

describe("switch-on runs", () => {
  const rc = (capacitance: number): Circuit => ({
    ground: "gnd",
    elements: [
      { id: "V1", kind: "voltageSource", nodes: ["in", "gnd"], voltage: 5 },
      { id: "R1", kind: "resistor", nodes: ["in", "out"], resistance: 1000 },
      { id: "C1", kind: "capacitor", nodes: ["out", "gnd"], capacitance },
    ],
  });

  it("skips the run when nothing stores energy", () => {
    const outcome = solveSwitchOnNow({
      ground: "gnd",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "gnd"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "gnd"], resistance: 1000 },
      ],
    });
    expect(outcome).toMatchObject({ ok: true, solution: null, settled: true });
  });

  it.each([1e-9, 1e-6, 1e-3])("frames the settling of a %s F RC filter", (capacitance) => {
    const outcome = solveSwitchOnNow(rc(capacitance));
    if (!outcome.ok || !outcome.solution) throw new Error("no run");
    const tau = 1000 * capacitance;
    const stop = outcome.solution.times.at(-1) ?? 0;
    // 0.2 % of 5 V takes ln(500) ≈ 6.2 time constants, framed with headroom to a 1–2–5 value.
    expect(outcome.settled).toBe(true);
    expect(stop).toBeGreaterThanOrEqual(6.2 * tau);
    expect(stop).toBeLessThanOrEqual(20 * tau);
    expect(outcome.solution.times).toHaveLength(SWITCH_ON_STEPS);
    expect(outcome.solution.nodeVoltages.out?.at(-1)).toBeCloseTo(5, 1);
  });

  it("reports a circuit still changing after the longest run", () => {
    const outcome = solveSwitchOnNow(rc(1));
    expect(outcome).toMatchObject({ ok: true, settled: false });
  });

  it("finds when every node stays near the operating point", () => {
    const dc = solveNow(rc(1e-6));
    const run = solveTransientNow(rc(1e-6), { stopTime: 1e-2, timeStep: 1e-5 });
    if (!dc.ok || !run.ok) throw new Error("no solve");
    expect(settleTime(run.solution, dc.solution)).toBeCloseTo(1e-3 * Math.log(500), 4);
  });
});
