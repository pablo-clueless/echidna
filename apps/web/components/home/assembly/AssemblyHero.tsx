"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import type { Progress } from "./AssemblyScene";
import { buildSteps } from "./parts";
import { cn } from "@/lib/utils";

const AssemblyScene = dynamic(() => import("./AssemblyScene").then((m) => m.AssemblyScene), { ssr: false });

const steps = buildSteps();

const useOnScreen = <T extends Element>() => {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, onScreen] as const;
};

export const AssemblyHero = () => {
  const t = useTranslations("Home.assembly");
  const reduced = usePrefersReducedMotion();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const callout = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<Progress>({ active: -1, placed: 0, phase: "assembling" });
  const labels = useMemo(() => steps.map((s) => t(`parts.${s.key}`)), [t]);
  const onProgress = useCallback((p: Progress) => setProgress(p), []);

  const shown = reduced ? { active: -1, placed: steps.length, phase: "powered" as const } : progress;
  const powered = shown.phase === "powered";
  const active = steps[shown.active];

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-foreground/5">
      <div
        role="img"
        aria-label={t("label")}
        className="relative aspect-4/3 w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,var(--card),var(--muted))]"
      >
        <AssemblyScene callout={callout} reduced={reduced} running={onScreen} onProgress={onProgress} />

        <div
          ref={callout}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-200 will-change-transform"
        >
          {active && (
            <div
              key={active.key}
              className="flex items-center gap-1.5 rounded-full border bg-background/90 py-1 pr-2.5 pl-1 text-[11px] whitespace-nowrap shadow-sm backdrop-blur motion-safe:animate-pop"
            >
              <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-foreground">
                {active.designator}
              </span>
              <span className="font-medium">{labels[shown.active]}</span>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full border bg-background/85 px-3 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full transition-colors duration-500",
              powered ? "bg-primary motion-safe:animate-pulse" : "bg-muted-foreground/40",
            )}
          />
          {powered ? t("powered") : shown.phase === "resetting" ? t("resetting") : t("placing")}
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium">{t("board")}</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {t("placed", { placed: shown.placed, total: steps.length })}
          </span>
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-1" aria-hidden>
          {steps.map((step, i) => {
            const state = i === shown.active ? "active" : i < shown.placed ? "placed" : "pending";
            return (
              <li
                key={step.key}
                title={labels[i]}
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors duration-300",
                  state === "active" && "border-primary bg-primary text-primary-foreground",
                  state === "placed" && "border-foreground/15 bg-foreground/6 text-foreground",
                  state === "pending" && "border-dashed border-foreground/20 text-muted-foreground",
                )}
              >
                {step.designator}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
