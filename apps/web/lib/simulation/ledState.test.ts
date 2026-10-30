import type { DcSolution } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";
import { describe, expect, it } from "vitest";

import { ledState } from "./ledState";

const solved = (nodes: [string, string], voltages: Record<string, number>, current: number) => {
  const build = {
    circuit: { ground: "0", elements: [{ id: "D1", kind: "diode", nodes, saturationCurrent: 1e-19 }] },
    netNodes: {},
    specs: {},
  } as unknown as CircuitBuild;
  const solution = { nodeVoltages: { "0": 0, ...voltages }, pinCurrents: { D1: [current, -current] } } as unknown as DcSolution;
  return ledState(build, solution, "D1");
};

describe("ledState", () => {
  it("is lit when it carries visible current", () => {
    expect(solved(["a", "0"], { a: 2 }, 0.012)).toEqual({ lit: true, current: 0.012 });
  });

  it("is shorted when both leads are on one net", () => {
    expect(solved(["0", "0"], {}, 0)).toEqual({ lit: false, reason: "shorted" });
  });

  it("is unwired when a lead has no wire", () => {
    expect(solved(["a", "p:D1/k"], { a: 3.3, "p:D1/k": 2.5 }, 2.5e-12)).toEqual({ lit: false, reason: "unwired" });
  });

  it("is reversed when the cathode is above the anode", () => {
    expect(solved(["0", "k"], { k: 5 }, -5e-12)).toEqual({ lit: false, reason: "reversed" });
  });

  it("is open when the loop is broken elsewhere", () => {
    expect(solved(["a", "0"], { a: 0 }, 1e-30)).toEqual({ lit: false, reason: "open" });
  });

  it("is unknown when the LED was not solved", () => {
    const build = { circuit: { ground: "0", elements: [] }, netNodes: {}, specs: {} } as unknown as CircuitBuild;
    expect(ledState(build, {} as DcSolution, "D1")).toBeUndefined();
  });
});
