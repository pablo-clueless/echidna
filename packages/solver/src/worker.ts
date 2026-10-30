import type { SolveRequest, SolveResponse } from "./client";
import { solveNow, solveSwitchOnNow } from "./solve";
import init from "../wasm/solver.js";

const ready = init({ module_or_path: new URL("../wasm/solver_bg.wasm", import.meta.url) });

self.addEventListener("message", async (event: MessageEvent<SolveRequest>) => {
  await ready;
  const request = event.data;
  const response: SolveResponse =
    request.kind === "dc"
      ? { id: request.id, kind: "dc", outcomes: request.circuits.map(solveNow) }
      : { id: request.id, kind: "switchOn", outcome: solveSwitchOnNow(request.circuit) };
  self.postMessage(response);
});
