"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Severity } from "@echidna/core";
import { useId, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LED_MAX_CURRENT, resistorOptions, solveLedCircuit, WARN_RATIO } from "./ledCircuit";
import { useTweenedNumber } from "@/lib/useTweenedNumber";
import { CircuitDiagram } from "./CircuitDiagram";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DEFAULT_INDEX = resistorOptions.indexOf(330);

const verdictStyles: Record<Severity, { dot: string; text: string; bar: string }> = {
  pass: { dot: "bg-status-pass", text: "text-status-pass-text", bar: "bg-status-pass" },
  warn: { dot: "bg-status-warn ring-1 ring-status-warn-border", text: "text-status-warn-text", bar: "bg-status-warn" },
  fail: { dot: "bg-status-fail", text: "text-status-fail-text", bar: "bg-status-fail" },
};

const explainKey = { pass: "explainPass", warn: "explainWarn", fail: "explainFail" } as const;

export const SwapDemo = () => {
  const t = useTranslations("Home.demo");
  const format = useFormatter();
  const sliderId = useId();
  const [index, setIndex] = useState(DEFAULT_INDEX);

  const resistance = resistorOptions[index] ?? 330;
  const { current, ratio, severity } = solveLedCircuit(resistance);
  const shownCurrent = useTweenedNumber(current);
  const shownRatio = useTweenedNumber(ratio);
  const styles = verdictStyles[severity];

  const milliamps = (amps: number) => format.number(amps * 1000, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 0 });
  const resistanceValue = format.number(resistance);
  const resistanceLabel = `${resistanceValue} Ω`;
  const rating = format.number(LED_MAX_CURRENT * 1000);

  return (
    <Card className="relative gap-0 py-0 shadow-xl shadow-foreground/5">
      <CardHeader className="border-b px-5 pt-5 pb-4">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("caption")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 px-5 py-5">
        <CircuitDiagram resistance={resistanceValue} ratio={ratio} severity={severity} title={t("diagramLabel")} />

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={sliderId}>{t("resistor")}</Label>
            <span className="font-mono text-sm font-medium tabular-nums">
              {resistanceValue}
              <span className="ml-1 font-sans">Ω</span>
            </span>
          </div>
          <Slider
            id={sliderId}
            min={0}
            max={resistorOptions.length - 1}
            step={1}
            value={[index]}
            onValueChange={([next]) => setIndex(next ?? DEFAULT_INDEX)}
            aria-valuetext={resistanceLabel}
          />
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>{t("moreResistance")}</span>
            <span>{t("lessResistance")}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/60 p-4">
          <div>
            <div className="text-xs text-muted-foreground">{t("current")}</div>
            <div className="font-mono text-2xl font-medium tabular-nums">
              {milliamps(shownCurrent)}
              <span className="ml-1 text-sm text-muted-foreground">mA</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("rating", { rating })}</div>
            <div className="font-mono text-2xl font-medium tabular-nums">{percent(shownRatio)}</div>
          </div>
          <div className="relative col-span-2 h-1.5 rounded-full bg-foreground/10" aria-hidden>
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full transition-colors duration-300", styles.bar)}
              style={{ width: `${Math.min(shownRatio / 1.5, 1) * 100}%` }}
            />
            <span className="absolute -top-1 -bottom-1 w-px bg-foreground/40" style={{ left: `${(WARN_RATIO / 1.5) * 100}%` }} />
            <span className="absolute -top-1 -bottom-1 w-px bg-foreground/70" style={{ left: `${(1 / 1.5) * 100}%` }} />
          </div>
        </div>

        <div className="flex items-start gap-3" aria-live="polite">
          <span
            key={severity}
            aria-hidden
            className={cn("mt-1.5 size-2.5 shrink-0 rounded-full motion-safe:animate-pop", styles.dot)}
          />
          <p className="text-sm leading-relaxed">
            <span key={`${severity}-label`} className={cn("inline-block font-medium motion-safe:animate-pop", styles.text)}>
              {t(severity)}.
            </span>{" "}
            {t(explainKey[severity], { current: milliamps(current), percent: percent(ratio), rating })}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">{t("note")}</p>
      </CardContent>
    </Card>
  );
};
