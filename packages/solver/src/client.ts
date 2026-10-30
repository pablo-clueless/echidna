import type { Circuit, SolveOutcome, SwitchOnOutcome } from "./types";

type Payload = { kind: "dc"; circuits: Circuit[] } | { kind: "switchOn"; circuit: Circuit };

export type SolveRequest = { id: number } & Payload;
export type SolveResponse = { id: number } & (
  | { kind: "dc"; outcomes: SolveOutcome[] }
  | { kind: "switchOn"; outcome: SwitchOnOutcome }
);

export type SolverClient = {
  /** Solves the live circuit. Resolves `null` if a newer `solve` call superseded this one. */
  solve: (circuit: Circuit) => Promise<SolveOutcome | null>;
  /** Solves several variants, such as swap candidates, without superseding or being superseded. */
  solveBatch: (circuits: Circuit[]) => Promise<SolveOutcome[] | null>;
  /** Runs the live circuit from switch-on. Resolves `null` if a newer `switchOn` call superseded this one. */
  switchOn: (circuit: Circuit) => Promise<SwitchOnOutcome | null>;
  dispose: () => void;
};

/**
 * Starts the solver in a Web Worker so the main thread never blocks. For `solve` and `switchOn`, only the latest
 * request of each kind is delivered; older in-flight requests resolve `null`.
 * @returns A client bound to one worker. Call `dispose` when done.
 */
export const createSolverClient = (): SolverClient => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, (response: SolveResponse | null) => void>();
  const live = { dc: new Set<number>(), switchOn: new Set<number>() };
  let nextId = 0;

  worker.addEventListener("message", (event: MessageEvent<SolveResponse>) => {
    const { id } = event.data;
    pending.get(id)?.(event.data);
    pending.delete(id);
    live.dc.delete(id);
    live.switchOn.delete(id);
  });

  const send = (payload: Payload) => {
    const id = ++nextId;
    const promise = new Promise<SolveResponse | null>((resolve) => pending.set(id, resolve));
    worker.postMessage({ id, ...payload } satisfies SolveRequest);
    return { id, promise };
  };

  /** Resolves every older request of one kind with `null`, then sends this one as the latest. */
  const latest = (channel: Set<number>, payload: Payload) => {
    for (const older of channel) {
      pending.get(older)?.(null);
      pending.delete(older);
    }
    channel.clear();
    const { id, promise } = send(payload);
    channel.add(id);
    return promise;
  };

  return {
    solve: async (circuit) => {
      const response = await latest(live.dc, { kind: "dc", circuits: [circuit] });
      return response?.kind === "dc" ? (response.outcomes[0] ?? null) : null;
    },
    solveBatch: async (circuits) => {
      const response = await send({ kind: "dc", circuits }).promise;
      return response?.kind === "dc" ? response.outcomes : null;
    },
    switchOn: async (circuit) => {
      const response = await latest(live.switchOn, { kind: "switchOn", circuit });
      return response?.kind === "switchOn" ? response.outcome : null;
    },
    dispose: () => {
      worker.terminate();
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      live.dc.clear();
      live.switchOn.clear();
    },
  };
};
