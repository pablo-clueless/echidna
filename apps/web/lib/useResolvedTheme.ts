"use client";

import { useSyncExternalStore } from "react";

import type { ResolvedTheme } from "./theme";

const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

const getTheme = (): ResolvedTheme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerTheme = (): ResolvedTheme => "light";

/**
 * Tracks the theme currently applied to `<html data-theme>`, for code that cannot use CSS variables (e.g. WebGL).
 * @returns The active `light` or `dark` theme.
 */
export const useResolvedTheme = (): ResolvedTheme => useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
