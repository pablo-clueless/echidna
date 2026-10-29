import type { DcSolution, SolveError } from "@echidna/solver/types";
import type { CircuitBuild } from "@echidna/library";
import type { Violation } from "@echidna/core";
import { create } from "zustand";

export type Selection = { kind: "component" | "wire"; id: string } | null;

export type Simulation = {
  build: CircuitBuild;
  solution: DcSolution | null;
  error: SolveError | null;
  /** Time from the edit to verdicts being available, in milliseconds. */
  latencyMs: number;
};

type StudioState = {
  selection: Selection;
  selectedComponentId: string | null;
  violations: Violation[];
  simulation: Simulation | null;
  /** Whether edits are solved live. Off pauses the solver and clears verdicts. */
  simulating: boolean;
  setSimulating: (simulating: boolean) => void;
  select: (selection: Selection) => void;
  selectComponent: (id: string | null) => void;
  setViolations: (violations: Violation[]) => void;
  setSimulation: (simulation: Simulation | null, violations: Violation[]) => void;
};

/**
 * Transient studio session state: current selection and the latest solver and rule-engine results.
 * @returns The studio store.
 */
export const useStudioStore = create<StudioState>()((set) => ({
  selection: null,
  selectedComponentId: null,
  violations: [],
  simulation: null,
  simulating: true,
  setSimulating: (simulating) => set(simulating ? { simulating } : { simulating, simulation: null, violations: [] }),
  select: (selection) =>
    set({ selection, selectedComponentId: selection?.kind === "component" ? selection.id : null }),
  selectComponent: (id) =>
    set({ selection: id ? { kind: "component", id } : null, selectedComponentId: id }),
  setViolations: (violations) => set({ violations }),
  setSimulation: (simulation, violations) => set({ simulation, violations }),
}));
