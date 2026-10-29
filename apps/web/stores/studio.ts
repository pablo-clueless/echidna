import type { Violation } from "@echidna/core";
import { create } from "zustand";

type StudioState = {
  selectedComponentId: string | null;
  violations: Violation[];
  selectComponent: (id: string | null) => void;
  setViolations: (violations: Violation[]) => void;
};

/**
 * Transient studio session state: current selection and the latest rule-engine results.
 * @returns The studio store.
 */
export const useStudioStore = create<StudioState>()((set) => ({
  selectedComponentId: null,
  violations: [],
  selectComponent: (selectedComponentId) => set({ selectedComponentId }),
  setViolations: (violations) => set({ violations }),
}));
