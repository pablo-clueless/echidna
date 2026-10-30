import { initSync, solveDc } from "@echidna/solver/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DcSolution } from "@echidna/solver/types";
import { partsById, toCircuit } from "@echidna/library";
import { evaluate } from "@echidna/rules";
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

  it("darkens the LED when the switch is opened", () => {
    const { build, solution } = solve("open");
    // An open switch is an ideal break, so nothing at all flows through it.
    expect(solution.pinCurrents.SW1).toEqual([0, -0]);
    expect(solution.componentPower.SW1).toBe(0);
    expect(Math.abs(solution.pinCurrents.D1?.[0] ?? 0)).toBeLessThan(1e-12);
    expect(ledState(build, solution, "D1")).toEqual({ lit: false, reason: "open" });
  });
});
