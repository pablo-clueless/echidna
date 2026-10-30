import {
  type Circuit,
  type DcSolution,
  type SolveOutcome,
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
