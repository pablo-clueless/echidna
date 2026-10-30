import { createJSONStorage, persist } from "zustand/middleware";
import type { Layout } from "react-resizable-panels";
import { create } from "zustand";

export const LAYOUT_STORAGE_KEY = "echidna-layout";

/** Solder-mask colours offered for the 3D board. */
export const maskColours = ["black", "green", "blue", "red"] as const;
export type MaskColour = (typeof maskColours)[number];

type LayoutState = {
  layouts: Record<string, Layout>;
  validatorExpanded: boolean;
  /** Library categories the user has collapsed. */
  collapsedCategories: string[];
  /** Solder-mask colour of the 3D board. A look only; it does not change the simulation. */
  maskColour: MaskColour;
  saveLayout: (groupId: string, layout: Layout) => void;
  setValidatorExpanded: (expanded: boolean) => void;
  setCategoryOpen: (category: string, open: boolean) => void;
  setMaskColour: (colour: MaskColour) => void;
};

/**
 * Studio panel sizes (per resizable group, as percentages keyed by panel id), drawer state, collapsed library
 * categories and the board's mask colour, persisted per user.
 * @returns The layout store.
 */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: {},
      validatorExpanded: false,
      collapsedCategories: [],
      maskColour: "black",
      saveLayout: (groupId, layout) => set((s) => ({ layouts: { ...s.layouts, [groupId]: layout } })),
      setValidatorExpanded: (validatorExpanded) => set({ validatorExpanded }),
      setCategoryOpen: (category, open) =>
        set((s) => ({
          collapsedCategories: open
            ? s.collapsedCategories.filter((c) => c !== category)
            : [...new Set([...s.collapsedCategories, category])],
        })),
      setMaskColour: (maskColour) => set({ maskColour }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ layouts, validatorExpanded, collapsedCategories, maskColour }) => ({
        layouts,
        validatorExpanded,
        collapsedCategories,
        maskColour,
      }),
      skipHydration: true,
    },
  ),
);
