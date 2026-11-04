"use client";

import "lenis/dist/lenis.css";
import { useEffect } from "react";
import Lenis from "lenis";

/** Eased, inertial page scrolling for the homepage. Skipped entirely when the user prefers reduced motion. */
export const SmoothScroll = () => {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.11, anchors: { offset: -72 } });
    return () => lenis.destroy();
  }, []);

  return null;
};
