"use client";

import { useEffect } from "react";

import { usePreferencesStore } from "@/stores/preferences";
import { useAssistantStore } from "@/stores/assistant";
import { useProjectStore } from "@/stores/project";
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
    void useProjectStore.persist.rehydrate();
    void useAssistantStore.persist.rehydrate();
    if (process.env.NODE_ENV === "development") {
      window.__echidna = {
        ...window.__echidna,
        preferences: usePreferencesStore,
        layout: useLayoutStore,
        studio: useStudioStore,
        project: useProjectStore,
        assistant: useAssistantStore,
      };
    }
  }, []);

  return null;
};
