import { createJSONStorage, persist } from "zustand/middleware";
import type { Layout } from "react-resizable-panels";
import { create } from "zustand";

export const LAYOUT_STORAGE_KEY = "echidna-layout";

type LayoutState = {
  layouts: Record<string, Layout>;
  validatorExpanded: boolean;
  /** Library categories the user has collapsed. */
  collapsedCategories: string[];
  saveLayout: (groupId: string, layout: Layout) => void;
  setValidatorExpanded: (expanded: boolean) => void;
  setCategoryOpen: (category: string, open: boolean) => void;
};

/**
 * Studio panel sizes (per resizable group, as percentages keyed by panel id), drawer state and collapsed library
 * categories, persisted per user.
 * @returns The layout store.
 */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: {},
      validatorExpanded: false,
      collapsedCategories: [],
      saveLayout: (groupId, layout) => set((s) => ({ layouts: { ...s.layouts, [groupId]: layout } })),
      setValidatorExpanded: (validatorExpanded) => set({ validatorExpanded }),
      setCategoryOpen: (category, open) =>
        set((s) => ({
          collapsedCategories: open
            ? s.collapsedCategories.filter((c) => c !== category)
            : [...new Set([...s.collapsedCategories, category])],
        })),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ layouts, validatorExpanded, collapsedCategories }) => ({
        layouts,
        validatorExpanded,
        collapsedCategories,
      }),
      skipHydration: true,
    },
  ),
);
