import type { DcSolution, TransientSolution } from "@echidna/solver/types";
import { type CircuitBuild, partsById, toCircuit } from "@echidna/library";
import { initSync, solveDc } from "@echidna/solver/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { solveSwitchOnNow } from "@echidna/solver/solve";
import type { Netlist } from "@echidna/core";
import { readFileSync } from "node:fs";

import { evaluate, evaluateSwitchOn, grade, worstAverage } from "./engine";

beforeAll(() => {
  initSync({ module: readFileSync(new URL("../../solver/wasm/solver_bg.wasm", import.meta.url)) });
});

/** The Phase 1 acceptance circuit: 5 V supply, 3.3 V LDO, series resistor, red LED. */
const regulatorWithLed = (resistance: number): Netlist => ({
  groundNetId: "gnd",
  components: [
    { id: "V1", specId: "dc-supply" },
    { id: "U1", specId: "ldo-3v3" },
    { id: "R1", specId: "resistor", paramOverrides: { resistance } },
    { id: "D1", specId: "led-5mm" },
    { id: "G1", specId: "ground" },
  ],
  nets: [
    { id: "vin", pins: [{ componentId: "V1", pinId: "pos" }, { componentId: "U1", pinId: "in" }] },
    { id: "vout", pins: [{ componentId: "U1", pinId: "out" }, { componentId: "R1", pinId: "1" }] },
    { id: "a", pins: [{ componentId: "R1", pinId: "2" }, { componentId: "D1", pinId: "a" }] },
    {
      id: "gnd",
      pins: [
        { componentId: "V1", pinId: "neg" },
        { componentId: "U1", pinId: "gnd" },
        { componentId: "D1", pinId: "k" },
        { componentId: "G1", pinId: "gnd" },
      ],
    },
  ],
});

const run = (resistance: number) => {
  const build = toCircuit(regulatorWithLed(resistance), partsById);
  const solution = solveDc(build.circuit) as DcSolution;
  return { build, solution, violations: evaluate(build, solution) };
};

const verdict = (resistance: number, componentId: string, ruleId: string) =>
  run(resistance).violations.find((v) => v.componentId === componentId && v.ruleId === ruleId);

describe("grade", () => {
  it("warns from 80 % and fails above 100 %", () => {
    const rule = { warnAt: 0.8, failAbove: 1 };
    expect(grade(0.79, rule)).toBe("pass");
    expect(grade(0.8, rule)).toBe("warn");
    expect(grade(1, rule)).toBe("warn");
    expect(grade(1.01, rule)).toBe("fail");
  });
});

describe("regulator with LED load", () => {
  it("passes with a 150 Ω series resistor", () => {
    const led = verdict(150, "D1", "currentRating");
    expect(led).toMatchObject({ severity: "pass", unit: "A", limit: 0.02, estimated: false });
    expect(led?.actual).toBeGreaterThan(0.008);
    expect(led?.actual).toBeLessThan(0.01);
  });

  it("warns when a smaller resistor pushes the LED past 80 % of its rating", () => {
    expect(verdict(68, "D1", "currentRating")).toMatchObject({ severity: "warn" });
  });

  it("fails when the LED current exceeds its rating", () => {
    expect(verdict(47, "D1", "currentRating")).toMatchObject({ severity: "fail" });
  });

  it("checks the regulator against its output current and input voltage, flagged as estimated", () => {
    const { violations, solution } = run(150);
    const current = violations.find((v) => v.componentId === "U1" && v.ruleId === "currentRating");
    const voltage = violations.find((v) => v.componentId === "U1" && v.ruleId === "voltageRating");
    expect(current?.actual).toBeCloseTo(solution.branchCurrents.D1 ?? 0, 9);
    expect(voltage?.actual).toBeCloseTo(5, 6);
    expect(current?.estimated).toBe(true);
  });

  it("skips parts without the rating a rule checks", () => {
    expect(run(150).violations.some((v) => v.componentId === "V1")).toBe(false);
  });

  it("solves and validates within the 100 ms budget", () => {
    const start = performance.now();
    for (const r of [150, 100, 68, 47, 33]) run(r);
    expect((performance.now() - start) / 5).toBeLessThan(100);
  });
});

describe("worstAverage", () => {
  it("finds the worst window and continues past the end at the last value", () => {
    expect(worstAverage([0, 10, 0, 0], 2)).toBe(5);
    expect(worstAverage([4, 1, 1], 1)).toBe(4);
    expect(worstAverage([1, 1, 3], 4)).toBe(3);
  });
});

/** The acceptance circuit with a capacitor from the regulator output to ground, behind `seriesResistance`. */
const withCapacitor = (capacitance: number, seriesResistance?: number): Netlist => {
  const netlist = regulatorWithLed(150);
  const c = { componentId: "C1", pinId: "1" };
  netlist.components.push({ id: "C1", specId: "capacitor-ceramic", paramOverrides: { capacitance } });
  if (seriesResistance === undefined) {
    netlist.nets.find((n) => n.id === "vout")?.pins.push(c);
  } else {
    netlist.components.push({ id: "R2", specId: "resistor", paramOverrides: { resistance: seriesResistance } });
    netlist.nets.find((n) => n.id === "vout")?.pins.push({ componentId: "R2", pinId: "1" });
    netlist.nets.push({ id: "slow", pins: [{ componentId: "R2", pinId: "2" }, c] });
  }
  netlist.nets.find((n) => n.id === "gnd")?.pins.push({ componentId: "C1", pinId: "2" });
  return netlist;
};

const switchOn = (build: CircuitBuild) => {
  const outcome = solveSwitchOnNow(build.circuit);
  if (!outcome.ok || !outcome.solution) throw new Error("no switch-on run");
  return evaluateSwitchOn(build, outcome.solution);
};

const issues = (violations: ReturnType<typeof evaluate>) =>
  violations.filter((v) => v.severity !== "pass").map((v) => `${v.componentId} ${v.ruleId} ${v.severity}`);

describe("switch-on rules", () => {
  it("leaves DC verdicts to the DC rules", () => {
    expect(run(150).violations.some((v) => v.ruleId.startsWith("switchOn"))).toBe(false);
  });

  it("does not flag the instant spike charging a decoupling capacitor straight from the regulator", () => {
    const build = toCircuit(withCapacitor(10e-6), partsById);
    expect(issues(switchOn(build))).toEqual([]);
  });

  it("flags a regulator and resistor overloaded while a large capacitor charges, though DC passes", () => {
    const build = toCircuit(withCapacitor(1, 2), partsById);
    expect(issues(evaluate(build, solveDc(build.circuit) as DcSolution))).toEqual([]);
    const found = issues(switchOn(build));
    expect(found).toContain("U1 switchOnCurrent fail");
    expect(found).toContain("R2 switchOnPower fail");
  });

  it("catches LC overshoot past a capacitor's voltage rating", () => {
    const capacitor = partsById.get("capacitor-ceramic");
    if (!capacitor) throw new Error("missing part");
    const build: CircuitBuild = {
      circuit: {
        ground: "0",
        elements: [
          { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 10 },
          { id: "L1", kind: "inductor", nodes: ["in", "a"], inductance: 1e-3 },
          { id: "R1", kind: "resistor", nodes: ["a", "b"], resistance: 1 },
          { id: "C1", kind: "capacitor", nodes: ["b", "0"], capacitance: 10e-6 },
        ],
      },
      netNodes: {},
      specs: { C1: capacitor },
    };
    const outcome = solveSwitchOnNow(build.circuit);
    if (!outcome.ok || !outcome.solution) throw new Error("no switch-on run");
    const solution: TransientSolution = outcome.solution;
    const peak = evaluateSwitchOn(build, solution).find((v) => v.ruleId === "switchOnVoltage");
    // An underdamped series RLC overshoots towards twice the 10 V supply, past the 16 V rating.
    expect(peak?.actual).toBeGreaterThan(16);
    expect(peak?.severity).toBe("fail");
  });
});