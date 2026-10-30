import { evaluate, evaluateSwitchOn } from "@echidna/rules";
import { initSync, solveDc } from "@echidna/solver/wasm";
import { solveSwitchOnNow } from "@echidna/solver/solve";
import { beforeAll, describe, expect, it } from "vitest";
import type { DcSolution } from "@echidna/solver/types";
import { partsById, toCircuit } from "@echidna/library";
import { readFileSync } from "node:fs";

import { LED_LIT_CURRENT, ledState } from "@/lib/simulation/ledState";
import { regulatorExample } from "./example";
import { toNetlist } from "./model";

beforeAll(() => {
  initSync({ module: readFileSync(new URL("../../../../packages/solver/wasm/solver_bg.wasm", import.meta.url)) });
});

const solve = (switchPosition: "closed" | "open") => {
  const project = regulatorExample();
  project.components = project.components.map((c) => (c.id === "SW1" ? { ...c, variant: switchPosition } : c));
  const build = toCircuit(toNetlist(project), partsById);
  return { build, solution: solveDc(build.circuit) as DcSolution };
};

describe("regulator example", () => {
  it("starts with the switch closed, so current flows and the LED lights", () => {
    const { build, solution } = solve("closed");
    const current = solution.pinCurrents.D1?.[0] ?? 0;
    // 3.3 V less the red LED's 2 V forward drop, across 150 Ω.
    expect(current).toBeGreaterThan(0.007);
    expect(current).toBeLessThan(0.01);
    expect(current).toBeGreaterThan(LED_LIT_CURRENT);
    expect(Math.abs(solution.pinCurrents.SW1?.[0] ?? 0)).toBeGreaterThan(0.007);
    expect(ledState(build, solution, "D1")?.lit).toBe(true);
    expect(evaluate(build, solution).filter((v) => v.severity !== "pass")).toEqual([]);
  });

  it("flags a capacitor across the LED resistor so large that start-up overloads the regulator", () => {
    const project = regulatorExample();
    project.components.push({ id: "C1", specId: "capacitor-ceramic", paramOverrides: { capacitance: 1e4 } });
    project.wires.push(
      { id: "WC1", a: { componentId: "C1", pinId: "1" }, b: { componentId: "R1", pinId: "1" } },
      { id: "WC2", a: { componentId: "C1", pinId: "2" }, b: { componentId: "R1", pinId: "2" } },
    );
    const build = toCircuit(toNetlist(project), partsById);
    const dc = solveDc(build.circuit) as DcSolution;
    expect(evaluate(build, dc).filter((v) => v.severity !== "pass")).toEqual([]);

    const outcome = solveSwitchOnNow(build.circuit);
    if (!outcome.ok || !outcome.solution) throw new Error("no switch-on run");
    const failures = evaluateSwitchOn(build, outcome.solution)
      .filter((v) => v.severity === "fail")
      .map((v) => `${v.componentId} ${v.ruleId}`);
    expect(failures).toEqual(expect.arrayContaining(["U1 switchOnCurrent", "D1 switchOnCurrent", "SW1 switchOnCurrent"]));
  });

  it("darkens the LED when the switch is opened", () => {
    const { build, solution } = solve("open");
    // An open switch is an ideal break, so nothing at all flows through it.
    expect(solution.pinCurrents.SW1).toEqual([0, -0]);
    expect(solution.componentPower.SW1).toBe(0);
    expect(Math.abs(solution.pinCurrents.D1?.[0] ?? 0)).toBeLessThan(1e-12);
    expect(ledState(build, solution, "D1")).toEqual({ lit: false, reason: "open" });
  });
});
