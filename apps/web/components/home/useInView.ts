"use client";

import { useEffect, useRef, useState } from "react";

/** `idle` before hydration (content shows as-is), `hidden` while waiting to scroll in, `shown` once it has. */
export type InViewPhase = "idle" | "hidden" | "shown";

/**
 * Reports when an element first scrolls into view, for one-off entrance animations.
 * @param rootMargin - Margin passed to the observer; the default waits until the element is 15% into the viewport.
 * @returns A ref for the element and its phase.
 */
export const useInView = <T extends Element>(rootMargin = "0px 0px -15% 0px") => {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<InViewPhase>("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPhase("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setPhase("shown");
        observer.disconnect();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, phase] as const;
};

/**
 * Tracks whether an element is currently on screen, for looping animations that should pause off screen.
 * @returns A ref for the element and whether it is visible.
 */
export const useOnScreen = <T extends Element>() => {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, onScreen] as const;
};
