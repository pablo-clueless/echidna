import {
  type Circuit,
  type DcSolution,
  type SolveOutcome,
  type SwitchOnOutcome,
  type TransientOptions,
  type TransientOutcome,
  type TransientSolution,
  isSolveError,
} from "./types";
import { solveDc, solveTransient } from "../wasm/solver.js";

/**
 * Runs a DC solve against an already initialised WASM module and times it.
 * @param circuit - Circuit to solve.
 * @returns The solution, or a structured error, with the time taken.
 */
export const solveNow = (circuit: Circuit): SolveOutcome => {
  const start = performance.now();
  try {
    const solution = solveDc(circuit) as DcSolution;
    return { ok: true, solution, durationMs: performance.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: isSolveError(error) ? error : { code: "internal", message: String(error) },
      durationMs: performance.now() - start,
    };
  }
};

/**
 * Runs a transient analysis from switch-on against an already initialised WASM module and times it.
 * @param circuit - Circuit to simulate.
 * @param options - Stop time and longest step, in seconds.
 * @returns The sampled series, or a structured error, with the time taken.
 */
export const solveTransientNow = (circuit: Circuit, options: TransientOptions): TransientOutcome => {
  const start = performance.now();
  try {
    const solution = solveTransient(circuit, options) as TransientSolution;
    return { ok: true, solution, durationMs: performance.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: isSolveError(error) ? error : { code: "internal", message: String(error) },
      durationMs: performance.now() - start,
    };
  }
};

/** Samples per switch-on run: smooth enough to plot, cheap enough to re-run on every edit. */
export const SWITCH_ON_STEPS = 400;
const FIRST_STOP = 1e-5;
const LAST_STOP = 10;
/** A node has settled once it stays within this fraction of the circuit's largest operating-point voltage. */
const SETTLED = 2e-3;

const storesEnergy = (circuit: Circuit) =>
  circuit.elements.some(
    (e) => (e.kind === "capacitor" && e.capacitance > 0) || (e.kind === "inductor" && e.inductance > 0),
  );

/** Rounds up to 1, 2 or 5 times a power of ten. */
const niceCeil = (value: number) => {
  const decade = 10 ** Math.floor(Math.log10(value));
  return (([1, 2, 5].find((m) => m * decade >= value * (1 - 1e-9)) ?? 10) * decade);
};

/**
 * When every node voltage comes within tolerance of the operating point and stays there.
 * @param solution - Transient run.
 * @param dc - Operating point the run heads towards.
 * @returns The settling time in seconds, or `null` if the run ends before settling.
 */
export const settleTime = (solution: TransientSolution, dc: DcSolution): number | null => {
  const nodes = Object.entries(solution.nodeVoltages);
  const scale = Math.max(1e-3, ...Object.values(dc.nodeVoltages).map(Math.abs));
  const tolerance = SETTLED * scale;
  const away = (i: number) => nodes.some(([node, series]) => Math.abs((series[i] ?? 0) - (dc.nodeVoltages[node] ?? 0)) > tolerance);
  let last = solution.times.length - 1;
  if (away(last)) return null;
  while (last > 0 && !away(last - 1)) last--;
  return last === 0 ? 0 : (solution.times[last - 1] ?? 0);
};

/**
 * Runs a circuit from switch-on for as long as it takes to settle, trying runs ten times longer each time, from
 * 10 µs to 10 s, then reframing the run around the settling time so the change fills the plot.
 * @param circuit - Circuit to simulate.
 * @returns The run, or a structured error, with the total time taken.
 */
export const solveSwitchOnNow = (circuit: Circuit): SwitchOnOutcome => {
  const start = performance.now();
  const durationMs = () => performance.now() - start;
  if (!storesEnergy(circuit)) return { ok: true, solution: null, settled: true, durationMs: durationMs() };
  const dc = solveNow(circuit);
  if (!dc.ok) return { ok: false, error: dc.error, durationMs: durationMs() };

  const run = (stopTime: number) => solveTransientNow(circuit, { stopTime, timeStep: stopTime / SWITCH_ON_STEPS });
  let latest: TransientSolution | null = null;
  for (let stop = FIRST_STOP; stop <= LAST_STOP * (1 + 1e-9); stop *= 10) {
    const outcome = run(stop);
    if (!outcome.ok) return { ok: false, error: outcome.error, durationMs: durationMs() };
    latest = outcome.solution;
    const settled = settleTime(latest, dc.solution);
    if (settled === null) continue;
    const framed = niceCeil(Math.max(settled * 1.25, (stop / SWITCH_ON_STEPS) * 10));
    if (framed >= stop * (1 - 1e-9)) return { ok: true, solution: latest, settled: true, durationMs: durationMs() };
    const reframed = run(framed);
    return reframed.ok
      ? { ok: true, solution: reframed.solution, settled: true, durationMs: durationMs() }
      : { ok: false, error: reframed.error, durationMs: durationMs() };
  }
  return { ok: true, solution: latest, settled: false, durationMs: durationMs() };
};
