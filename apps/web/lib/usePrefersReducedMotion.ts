"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

/**
 * Tracks the user's reduced-motion preference for animations driven from JavaScript.
 * @returns `true` when the user has asked for less motion.
 */
export const usePrefersReducedMotion = (): boolean => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
