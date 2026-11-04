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

const PowerGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" className={className} aria-hidden>
    <path d="M8 1.75v6" />
    <path d="M4.4 4.1a5 5 0 1 0 7.2 0" />
  </svg>
);

type Props = {
  /** Drops the card frame so the scene can sit flush inside a bordered grid cell. */
  bare?: boolean;
};

export const AssemblyHero = ({ bare = false }: Props) => {
  const t = useTranslations("Home.assembly");
  const reduced = usePrefersReducedMotion();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const callout = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  const [progress, setProgress] = useState<Progress>({ active: -1, lit: 0, phase: "off" });
  const labels = useMemo(() => steps.map((s) => t(`parts.${s.key}`)), [t]);
  const onProgress = useCallback((p: Progress) => setProgress(p), []);

  const shown: Progress = !on
    ? { active: -1, lit: 0, phase: "off" }
    : reduced
      ? { active: -1, lit: steps.length, phase: "powered" }
      : progress;
  const powered = shown.phase === "powered";
  const active = steps[shown.active];

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col overflow-hidden",
        bare ? "h-full" : "rounded-2xl border bg-card shadow-xl shadow-foreground/5",
      )}
    >
      <div className="relative aspect-4/3 w-full grow overflow-hidden">
        <div role="img" aria-label={t("label")} className="absolute inset-0">
          <AssemblyScene callout={callout} on={on} reduced={reduced} running={onScreen} onProgress={onProgress} />
        </div>

        <div
          ref={callout}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-200 will-change-transform"
        >
          {active && (
            <div
              key={active.key}
              className="flex items-stretch border border-foreground bg-background text-[11px] whitespace-nowrap motion-safe:animate-pop"
            >
              <span className="bg-primary px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-foreground">
                {active.designator}
              </span>
              <span className="px-2 py-0.5 font-medium">{labels[shown.active]}</span>
            </div>
          )}
        </div>

        <div
          aria-live="polite"
          className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 border bg-background px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 transition-colors duration-500",
              powered ? "bg-primary motion-safe:animate-pulse" : on ? "bg-primary/60" : "bg-muted-foreground/40",
            )}
          />
          {powered ? t("powered") : on ? t("booting") : t("off")}
        </div>

        <button
          type="button"
          aria-pressed={on}
          onClick={() => setOn((v) => !v)}
          className={cn(
            "absolute right-3 bottom-3 flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors duration-300",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            on
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-foreground bg-background text-foreground hover:bg-foreground hover:text-background",
          )}
        >
          <PowerGlyph className="size-3.5" />
          {on ? t("powerOff") : t("powerOn")}
        </button>
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{t("board")}</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {t("lit", { lit: shown.lit, total: steps.length })}
          </span>
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-1" aria-hidden>
          {steps.map((step, i) => {
            const state = i === shown.active ? "active" : i < shown.lit ? "lit" : "off";
            return (
              <li
                key={step.key}
                title={labels[i]}
                className={cn(
                  "border px-2 py-0.5 font-mono text-[10px] transition-colors duration-300",
                  state === "active" && "border-primary bg-primary text-primary-foreground",
                  state === "lit" && "border-foreground bg-foreground text-background",
                  state === "off" && "border-foreground/30 text-muted-foreground",
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
