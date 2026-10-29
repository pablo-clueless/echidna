import { createJSONStorage, persist } from "zustand/middleware";
import type { Layout } from "react-resizable-panels";
import { create } from "zustand";

export const LAYOUT_STORAGE_KEY = "echidna-layout";

type LayoutState = {
  layouts: Record<string, Layout>;
  validatorExpanded: boolean;
  saveLayout: (groupId: string, layout: Layout) => void;
  setValidatorExpanded: (expanded: boolean) => void;
};

/**
 * Studio panel sizes (per resizable group, as percentages keyed by panel id) and drawer state, persisted per user.
 * @returns The layout store.
 */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: {},
      validatorExpanded: false,
      saveLayout: (groupId, layout) => set((s) => ({ layouts: { ...s.layouts, [groupId]: layout } })),
      setValidatorExpanded: (validatorExpanded) => set({ validatorExpanded }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ layouts, validatorExpanded }) => ({ layouts, validatorExpanded }),
      skipHydration: true,
    },
  ),
);
