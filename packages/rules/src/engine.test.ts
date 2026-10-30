import { initSync, solveDc } from "@echidna/solver/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DcSolution } from "@echidna/solver/types";
import { partsById, toCircuit } from "@echidna/library";
import type { Netlist } from "@echidna/core";
import { readFileSync } from "node:fs";

import { evaluate, grade } from "./engine";

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
