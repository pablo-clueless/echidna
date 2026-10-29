import { createSolverClient, type SolverClient } from "@echidna/solver";

let client: SolverClient | null = null;

/**
 * The shared solver worker, started on first use. Browser only.
 * @returns The solver client.
 */
export const getSolver = (): SolverClient => (client ??= createSolverClient());

/** Stops the shared worker; the next `getSolver` call starts a fresh one. */
export const disposeSolver = () => {
  client?.dispose();
  client = null;
};
