"use client";

import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useOnScreen } from "./useInView";
import { cn } from "@/lib/utils";

type Cell = "empty" | "hatch-v" | "hatch-h" | "signal" | "solid";

const weights: [Cell, number][] = [
  ["empty", 0.38],
  ["hatch-v", 0.26],
  ["hatch-h", 0.16],
  ["signal", 0.12],
  ["solid", 0.08],
];

const cellClass: Record<Cell, string> = {
  empty: "",
  "hatch-v": "hatch-v",
  "hatch-h": "hatch-h",
  signal: "bg-signal",
  solid: "bg-foreground",
};

/** Small seeded PRNG so the server and the first client render agree. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const pick = (r: number): Cell => {
  let acc = 0;
  for (const [cell, w] of weights) if (r < (acc += w)) return cell;
  return "empty";
};

type Props = {
  seed?: number;
  cols?: number;
  rows?: number;
  className?: string;
};

/** A grid of hatched, signal-coloured and black pixels that slowly reshuffles, like a board being probed. Decorative only. */
export const PixelField = ({ seed = 7, cols = 4, rows = 4, className }: Props) => {
  const reduced = usePrefersReducedMotion();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const [cells, setCells] = useState<Cell[]>(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: cols * rows }, () => pick(rand()));
  });

  useEffect(() => {
    if (reduced || !onScreen) return;
    const id = setInterval(() => {
      setCells((prev) => {
        const next = [...prev];
        for (let n = 0; n < 2; n++) next[Math.floor(Math.random() * next.length)] = pick(Math.random());
        return next;
      });
    }, 700);
    return () => clearInterval(id);
  }, [reduced, onScreen]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("grid h-full w-full", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {cells.map((cell, i) => (
        <span key={i} className={cn("border-r border-b border-foreground/6 transition-colors duration-500", cellClass[cell])} />
      ))}
    </div>
  );
};
