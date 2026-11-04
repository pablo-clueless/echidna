"use client";

import type { Severity } from "@echidna/core";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { useOnScreen } from "./useInView";
import { cn } from "@/lib/utils";

const order: Severity[] = ["pass", "warn", "fail"];

const dot: Record<Severity, string> = {
  pass: "bg-status-pass",
  warn: "bg-status-warn ring-1 ring-status-warn-border",
  fail: "bg-status-fail",
};

/** Cycles through the three verdicts, each sliding up into place. Decorative; the real verdicts live in the demo. */
export const VerdictTicker = () => {
  const t = useTranslations("Home");
  const reduced = usePrefersReducedMotion();
  const [ref, onScreen] = useOnScreen<HTMLDivElement>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || !onScreen) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % order.length), 2400);
    return () => clearInterval(id);
  }, [reduced, onScreen]);

  return (
    <div ref={ref} aria-hidden className="flex h-full flex-col justify-between gap-6 p-5">
      <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{t("hero.verdict")}</span>
      <div className="relative h-6 overflow-hidden">
        {order.map((severity, i) => {
          const offset = (i - index + order.length) % order.length;
          return (
            <div
              key={severity}
              className={cn(
                "absolute inset-0 flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
                offset === 0 && "translate-y-0 opacity-100",
                offset === 1 && "translate-y-full opacity-0",
                offset === 2 && "-translate-y-full opacity-0",
              )}
            >
              <span className={cn("size-2 shrink-0", dot[severity])} />
              {t(`demo.${severity}`)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
