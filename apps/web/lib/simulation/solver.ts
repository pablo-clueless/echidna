import { createSolverClient, type SolverClient } from "@echidna/solver";

let client: SolverClient | null = null;
let switchOnClient: SolverClient | null = null;

/**
 * The shared solver worker, started on first use. Browser only.
 * @returns The solver client.
 */
export const getSolver = (): SolverClient => (client ??= createSolverClient());

/**
 * A second worker for switch-on runs, which can take hundreds of milliseconds, so they never hold up the DC solves
 * that verdicts wait on. Browser only.
 * @returns The solver client for runs over time.
 */
export const getSwitchOnSolver = (): SolverClient => (switchOnClient ??= createSolverClient());

/** Stops both workers; the next calls start fresh ones. */
export const disposeSolver = () => {
  client?.dispose();
  switchOnClient?.dispose();
  client = null;
  switchOnClient = null;
};
