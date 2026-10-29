import type { Circuit, SolveOutcome } from "./types";

export type SolveRequest = { id: number; circuits: Circuit[] };
export type SolveResponse = { id: number; outcomes: SolveOutcome[] };

export type SolverClient = {
  /** Solves the live circuit. Resolves `null` if a newer `solve` call superseded this one. */
  solve: (circuit: Circuit) => Promise<SolveOutcome | null>;
  /** Solves several variants, such as swap candidates, without superseding or being superseded. */
  solveBatch: (circuits: Circuit[]) => Promise<SolveOutcome[] | null>;
  dispose: () => void;
};

/**
 * Starts the solver in a Web Worker so the main thread never blocks. For `solve`, only the latest request's
 * result is delivered; older in-flight requests resolve `null`.
 * @returns A client bound to one worker. Call `dispose` when done.
 */
export const createSolverClient = (): SolverClient => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (outcomes: SolveOutcome[] | null) => void>();
  const live = new Set<number>();
  let nextId = 0;

  worker.addEventListener("message", (event: MessageEvent<SolveResponse>) => {
    const { id, outcomes } = event.data;
    pending.get(id)?.(outcomes);
    pending.delete(id);
    live.delete(id);
  });

  const send = (circuits: Circuit[]) => {
    const id = ++nextId;
    const promise = new Promise<SolveOutcome[] | null>((resolve) => pending.set(id, resolve));
    worker.postMessage({ id, circuits } satisfies SolveRequest);
    return { id, promise };
  };

  return {
    solve: async (circuit) => {
      for (const older of live) {
        pending.get(older)?.(null);
        pending.delete(older);
      }
      live.clear();
      const { id, promise } = send([circuit]);
      live.add(id);
      return (await promise)?.[0] ?? null;
    },
    solveBatch: (circuits) => send(circuits).promise,
    dispose: () => {
      worker.terminate();
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      live.clear();
    },
  };
};
