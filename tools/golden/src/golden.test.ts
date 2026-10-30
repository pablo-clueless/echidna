import { solveNow, solveTransientNow } from "@echidna/solver/solve";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "@echidna/solver/wasm";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { ngspiceAvailable, runNgspice } from "./ngspice";
import { goldenDc, goldenTransient } from "./circuits";
import { parsePrintAll, toSpice } from "./spice";

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

/** HANDOFF §5: transient results must match ngspice within 1 %. */
const TRANSIENT_TOLERANCE = 1e-2;
/** Transient floors sit higher, as series pass through zero, where both simulators' step error is largest. */
const TRANSIENT_VOLTAGE_FLOOR = 1e-2;
const TRANSIENT_CURRENT_FLOOR = 1e-5;

const runTransient = ({ circuit, check }: (typeof goldenTransient)[number]) => {
  const outcome = solveTransientNow(circuit, check);
  if (!outcome.ok) throw new Error(`our solver failed: ${outcome.error.code}`);
  const { solution } = outcome;
  const sample = (series: number[] | undefined, time: number) => {
    const step = solution.times[0] ?? 0;
    const index = solution.times.findIndex((t) => Math.abs(t - time) < step / 2);
    return index < 0 ? undefined : series?.[index];
  };
  return { solution, sample };
};

describe("golden transient circuits in our solver", () => {
  it.each(goldenTransient)("$name runs to its stop time", (golden) => {
    const { solution } = runTransient(golden);
    expect(solution.times.at(-1)).toBeCloseTo(golden.check.stopTime, 12);
  });

  it("charges the RC filter to 63 % in one time constant", () => {
    const golden = goldenTransient.find((g) => g.name === "RC charge");
    if (!golden) throw new Error("missing circuit");
    const { solution, sample } = runTransient(golden);
    expect(sample(solution.nodeVoltages.out, 1e-3)).toBeCloseTo(5 * (1 - Math.exp(-1)), 3);
  });
});

describe.skipIf(!available)("golden transient circuits against ngspice", () => {
  it.each(goldenTransient)("$name", (golden) => {
    const { solution, sample } = runTransient(golden);
    const deck = toSpice(golden.circuit, golden.name, golden.check);
    const reference = parsePrintAll(runNgspice(deck.netlist));

    const mismatches: string[] = [];
    for (const m of deck.measures) {
      const expected = reference.get(m.name);
      const [label, actual, floor] =
        "node" in m
          ? [`V(${m.node})`, sample(solution.nodeVoltages[m.node], m.time), TRANSIENT_VOLTAGE_FLOOR]
          : [`I(${m.source})`, sample(solution.pinCurrents[m.source]?.[0], m.time), TRANSIENT_CURRENT_FLOOR];
      if (expected === undefined || actual === undefined) mismatches.push(`${label} at ${m.time} s: missing`);
      else if (Math.abs(actual - expected) > TRANSIENT_TOLERANCE * Math.max(Math.abs(expected), floor))
        mismatches.push(`${label} at ${m.time} s: ${actual} vs ngspice ${expected}`);
    }
    expect(mismatches, deck.netlist).toEqual([]);
  });
});
