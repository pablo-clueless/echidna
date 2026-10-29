"use client";

import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Eases a displayed number towards its target so live readouts glide instead of jumping.
 * Snaps immediately when the user prefers reduced motion.
 * @param target - The value to settle on.
 * @param duration - Tween length in milliseconds.
 * @returns The current in-between value.
 */
export const useTweenedNumber = (target: number, duration = 320): number => {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (reduced) {
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = origin + (target - origin) * easeOutCubic(t);
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return reduced ? target : value;
};
