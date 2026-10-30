import { beforeAll, describe, expect, it } from "vitest";
import { solveNow } from "@echidna/solver/solve";
import { initSync } from "@echidna/solver/wasm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { ngspiceAvailable, runNgspice } from "./ngspice";
import { parsePrintAll, toSpice } from "./spice";
import { goldenDc } from "./circuits";

/** HANDOFF §5: DC results must match ngspice within 0.1 %. */
const DC_TOLERANCE = 1e-3;
/** Below these, a relative tolerance is meaningless, so differences are compared absolutely. */
const VOLTAGE_FLOOR = 1e-6;
const CURRENT_FLOOR = 1e-9;

const required = process.env.REQUIRE_NGSPICE === "1";
const available = ngspiceAvailable();
if (required && !available) throw new Error("REQUIRE_NGSPICE is set but ngspice could not be started");

const close = (ours: number, reference: number, floor: number) =>
  Math.abs(ours - reference) <= DC_TOLERANCE * Math.max(Math.abs(reference), floor);

beforeAll(() => {
  const wasm = createRequire(import.meta.url).resolve("@echidna/solver/wasm").replace(/solver\.js$/, "solver_bg.wasm");
  initSync({ module: readFileSync(wasm) });
});

describe("golden DC circuits in our solver", () => {
  const solve = (name: string) => {
    const golden = goldenDc.find((g) => g.name === name);
    const outcome = golden && solveNow(golden.circuit);
    if (!outcome?.ok) throw new Error(`${name} did not solve`);
    return outcome.solution;
  };

  it.each(goldenDc)("$name solves", ({ circuit }) => {
    expect(solveNow(circuit).ok).toBe(true);
  });

  it("matches the divider formula", () => {
    expect(solve("voltage divider").nodeVoltages.mid).toBeCloseTo((12 * 2200) / 6900, 6);
  });

  it("follows the input less the dropout once out of regulation", () => {
    expect(solve("3.3 V regulator in dropout").nodeVoltages.out).toBeCloseTo(4 - 1.1, 6);
  });
});

describe.skipIf(!available)("golden DC circuits against ngspice", () => {
  it.each(goldenDc)("$name", ({ name, circuit }) => {
    const outcome = solveNow(circuit);
    if (!outcome.ok) throw new Error(`our solver failed: ${outcome.error.code}`);
    const deck = toSpice(circuit, name);
    const reference = parsePrintAll(runNgspice(deck.netlist));

    const mismatches: string[] = [];
    for (const [ours, spice] of deck.nodes) {
      if (spice === "0") continue;
      const expected = reference.get(spice);
      const actual = outcome.solution.nodeVoltages[ours];
      if (expected === undefined || actual === undefined) mismatches.push(`V(${ours}): missing`);
      else if (!close(actual, expected, VOLTAGE_FLOOR)) mismatches.push(`V(${ours}): ${actual} vs ngspice ${expected}`);
    }
    for (const [id, vector] of deck.sourceCurrents) {
      const expected = reference.get(vector);
      const actual = outcome.solution.branchCurrents[id];
      if (expected === undefined || actual === undefined) mismatches.push(`I(${id}): missing`);
      else if (!close(actual, expected, CURRENT_FLOOR)) mismatches.push(`I(${id}): ${actual} vs ngspice ${expected}`);
    }
    expect(mismatches, deck.netlist).toEqual([]);
  });
});
