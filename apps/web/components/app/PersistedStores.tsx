"use client";

import { useEffect } from "react";

import { usePreferencesStore } from "@/stores/preferences";
import { useLayoutStore } from "@/stores/layout";
import { useStudioStore } from "@/stores/studio";

declare global {
  interface Window {
    __echidna?: Record<string, unknown>;
  }
}

export const PersistedStores = () => {
  useEffect(() => {
    void usePreferencesStore.persist.rehydrate();
    void useLayoutStore.persist.rehydrate();
    if (process.env.NODE_ENV === "development") {
      window.__echidna = { preferences: usePreferencesStore, layout: useLayoutStore, studio: useStudioStore };
    }
  }, []);

  return null;
};
