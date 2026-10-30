import type { DcSolution, SolveError, SwitchOnOutcome } from "@echidna/solver/types";
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

/** The live circuit run from switch-on, with the build it was made from. */
export type SwitchOn = { build: CircuitBuild; outcome: SwitchOnOutcome };

type StudioState = {
  selection: Selection;
  selectedComponentId: string | null;
  /** Verdicts from the operating point, then from the switch-on run once it arrives. */
  violations: Violation[];
  /** The operating point's verdicts alone, which the switch-on run's issues are added to. */
  dcViolations: Violation[];
  simulation: Simulation | null;
  switchOn: SwitchOn | null;
  /** Sample of the switch-on run being scrubbed, which the 3D view shows; `null` shows the operating point. */
  playhead: number | null;
  /** Whether edits are solved live. Off pauses the solver and clears verdicts. */
  simulating: boolean;
  setSimulating: (simulating: boolean) => void;
  select: (selection: Selection) => void;
  selectComponent: (id: string | null) => void;
  setViolations: (violations: Violation[]) => void;
  setSimulation: (simulation: Simulation | null, violations: Violation[]) => void;
  /** Publishes a switch-on run, adding its warn and fail `issues` to the operating point's verdicts. */
  setSwitchOn: (switchOn: SwitchOn | null, issues?: Violation[]) => void;
  setPlayhead: (playhead: number | null) => void;
};

/**
 * Transient studio session state: current selection and the latest solver and rule-engine results.
 * @returns The studio store.
 */
export const useStudioStore = create<StudioState>()((set) => ({
  selection: null,
  selectedComponentId: null,
  violations: [],
  dcViolations: [],
  simulation: null,
  switchOn: null,
  playhead: null,
  simulating: true,
  setSimulating: (simulating) =>
    set(
      simulating
        ? { simulating }
        : { simulating, simulation: null, violations: [], dcViolations: [], switchOn: null, playhead: null },
    ),
  select: (selection) =>
    set({ selection, selectedComponentId: selection?.kind === "component" ? selection.id : null }),
  selectComponent: (id) =>
    set({ selection: id ? { kind: "component", id } : null, selectedComponentId: id }),
  setViolations: (violations) => set({ violations }),
  setSimulation: (simulation, violations) => set({ simulation, violations, dcViolations: violations }),
  setSwitchOn: (switchOn, issues = []) =>
    set((s) => ({ switchOn, playhead: null, violations: [...s.dcViolations, ...issues] })),
  setPlayhead: (playhead) => set({ playhead }),
}));
