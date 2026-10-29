import type { SolveRequest, SolveResponse } from "./client";
import init from "../wasm/solver.js";
import { solveNow } from "./solve";

const ready = init({ module_or_path: new URL("../wasm/solver_bg.wasm", import.meta.url) });

self.addEventListener("message", async (event: MessageEvent<SolveRequest>) => {
  await ready;
  const response: SolveResponse = { id: event.data.id, outcomes: event.data.circuits.map(solveNow) };
  self.postMessage(response);
});
