"use client";

import { evaluate, evaluateSwitchOn } from "@echidna/rules";
import { partsById, toCircuit } from "@echidna/library";
import { useEffect } from "react";

import { disposeSolver, getSolver, getSwitchOnSolver } from "./solver";
import { useProjectStore, type ProjectState } from "@/stores/project";
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
        useStudioStore.getState().setSwitchOn(null);
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

      // Started only once verdicts are out, so the slower run over time never competes with them for the CPU.
      if (!solution) {
        useStudioStore.getState().setSwitchOn(null);
        return;
      }
      const switchOn = await getSwitchOnSolver().switchOn(build.circuit);
      if (!switchOn || !useStudioStore.getState().simulating) return;
      const issues =
        switchOn.ok && switchOn.solution
          ? evaluateSwitchOn(build, switchOn.solution).filter((v) => v.severity !== "pass")
          : [];
      useStudioStore.getState().setSwitchOn({ build, outcome: switchOn }, issues);
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
