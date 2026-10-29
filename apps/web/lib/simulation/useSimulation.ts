"use client";

import { partsById, toCircuit } from "@echidna/library";
import { evaluate } from "@echidna/rules";
import { useEffect } from "react";

import { useProjectStore, type ProjectState } from "@/stores/project";
import { disposeSolver, getSolver } from "./solver";
import { useStudioStore } from "@/stores/studio";
import { toNetlist } from "@/lib/project/model";

type Electrical = Pick<ProjectState, "components" | "wires">;

/**
 * Keeps the solver and rule engine in step with the project: every electrical edit re-solves on the worker
 * and re-validates, publishing results to the studio store. Layout-only edits are ignored.
 *
 * The request is posted straight from the store subscription, before React re-renders for the same edit,
 * so the worker solves while the main thread renders. The worker client drops superseded results.
 */
export const useSimulation = () => {
  useEffect(() => {
    const run = async (project: Electrical) => {
      if (!useStudioStore.getState().simulating) return;
      const editedAt = performance.now();
      const build = toCircuit(toNetlist(project), partsById);
      if (build.circuit.elements.length === 0) {
        useStudioStore.getState().setSimulation(null, []);
        return;
      }
      const outcome = await getSolver().solve(build.circuit);
      if (!outcome || !useStudioStore.getState().simulating) return;
      const solution = outcome.ok ? outcome.solution : null;
      const violations = solution ? evaluate(build, solution) : [];
      useStudioStore.getState().setSimulation(
        { build, solution, error: outcome.ok ? null : outcome.error, latencyMs: performance.now() - editedAt },
        violations,
      );
    };

    void run(useProjectStore.getState());
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.components !== prev.components || s.wires !== prev.wires) void run(s);
    });
    const unsubscribeStudio = useStudioStore.subscribe((s, prev) => {
      if (s.simulating && !prev.simulating) void run(useProjectStore.getState());
    });

    return () => {
      unsubscribe();
      unsubscribeStudio();
      disposeSolver();
    };
  }, []);
};
