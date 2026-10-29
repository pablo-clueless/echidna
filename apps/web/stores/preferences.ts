import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

export const PREFERENCES_STORAGE_KEY = "echidna-preferences";

type PreferencesState = {
  theme: ThemePreference;
  learnMode: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLearnMode: (learnMode: boolean) => void;
};

/**
 * Per-user UI preferences, persisted to `localStorage`.
 * @returns The preferences store; select only the fields a component needs.
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      learnMode: false,
      setTheme: (theme) => set({ theme }),
      setLearnMode: (learnMode) => set({ learnMode }),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, learnMode }) => ({ theme, learnMode }),
      skipHydration: true,
    },
  ),
);
