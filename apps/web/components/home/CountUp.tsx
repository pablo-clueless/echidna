"use client";

import { useEffect, useState } from "react";
import { useFormatter } from "next-intl";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useInView } from "./useInView";

type Props = {
  value: number;
  duration?: number;
  className?: string;
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** A number that counts up from zero the first time it scrolls into view. */
export const CountUp = ({ value, duration = 1400, className }: Props) => {
  const format = useFormatter();
  const reduced = usePrefersReducedMotion();
  const [ref, phase] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced || phase === "idle") return;
    if (phase === "hidden") {
      setShown(0);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      setShown(Math.round(easeOutExpo(t) * value));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced, value, duration]);

  return (
    <span ref={ref} className={className}>
      {format.number(reduced ? value : shown)}
    </span>
  );
};
