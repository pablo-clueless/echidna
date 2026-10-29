"use client";

import { useEffect } from "react";

import { usePreferencesStore } from "@/stores/preferences";
import { applyTheme, darkQuery } from "@/lib/theme";
import { useHydrated } from "@/lib/persist";

export const ThemeSync = () => {
  const theme = usePreferencesStore((s) => s.theme);
  const hydrated = useHydrated(usePreferencesStore);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia(darkQuery);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [hydrated, theme]);

  return null;
};
