"use client";

import { type KeyboardEvent, type PointerEvent, useId, useMemo } from "react";
import type { ComponentSpec, NetlistComponent } from "@echidna/core";
import { useLocale, useTranslations } from "next-intl";

import { partResponse } from "@/lib/simulation/switchOn";
import { useStudioStore } from "@/stores/studio";
import { formatQuantity } from "@/lib/units";

const PLOT_HEIGHT = 100;

/** Value range for a plot, always including zero so a rise from nothing reads as one. */
const extent = (series: number[]): [number, number] => {
  const low = Math.min(0, ...series);
  const high = Math.max(0, ...series);
  return high - low > 0 ? [low, high] : [low - 1, high + 1];
};

type PlotProps = { label: string; value: string; series: number[]; playhead: number | null };

/** One quantity over the run: a 2px line on a zero baseline, with the playhead as a hairline and a dot. */
const Plot = ({ label, value, series, playhead }: PlotProps) => {
  const [low, high] = extent(series);
  const last = Math.max(1, series.length - 1);
  const y = (v: number) => PLOT_HEIGHT - ((v - low) / (high - low)) * PLOT_HEIGHT;
  const points = series.map((v, i) => `${i},${y(v).toFixed(2)}`).join(" ");
  const marker = playhead === null ? undefined : series[playhead];

  return (
    <figure className="grid gap-1">
      <figcaption className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums">{value}</span>
      </figcaption>
      <div className="relative h-12">
        <svg
          aria-hidden
          viewBox={`0 0 ${last} ${PLOT_HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <line x1={0} x2={last} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {playhead !== null && (
            <line
              x1={playhead}
              x2={playhead}
              y1={0}
              y2={PLOT_HEIGHT}
              className="stroke-foreground/40"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={points}
            fill="none"
            className="stroke-foreground"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {marker !== undefined && playhead !== null && (
          <span
            aria-hidden
            className="absolute size-2 -translate-1/2 rounded-full bg-foreground ring-2 ring-background"
            style={{ left: `${(playhead / last) * 100}%`, top: `${(y(marker) / PLOT_HEIGHT) * 100}%` }}
          />
        )}
      </div>
    </figure>
  );
};

/**
 * How the selected part behaves in the moments after the circuit is switched on, from the live switch-on run.
 * Pointing at the plots, or focusing them and using the arrow keys, scrubs the run and plays it back on the board.
 */
export const SwitchOnResponse = ({ component, spec }: { component: NetlistComponent; spec: ComponentSpec }) => {
  const t = useTranslations("Studio.inspector.switchOn");
  const locale = useLocale();
  const headingId = useId();
  const hintId = useId();
  const switchOn = useStudioStore((s) => s.switchOn);
  const playhead = useStudioStore((s) => s.playhead);
  const setPlayhead = useStudioStore((s) => s.setPlayhead);

  const outcome = switchOn?.outcome;
  const solution = outcome?.ok ? outcome.solution : null;
  const response = useMemo(
    () => (switchOn && solution ? partResponse(switchOn.build, solution, component.id) : undefined),
    [switchOn, solution, component.id],
  );

  if (!outcome) return null;
  if (!outcome.ok || !solution) {
    return (
      <section aria-labelledby={headingId} className="grid gap-1">
        <h3 id={headingId} className="text-xs font-medium text-muted-foreground">
          {t("title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t(outcome.ok ? "instant" : "failed")}</p>
      </section>
    );
  }
  if (!response) return null;

  const { times } = solution;
  const lastIndex = times.length - 1;
  const stop = formatQuantity(times[lastIndex] ?? 0, "s", locale);
  const pinName = (i: number) => spec.pins[i]?.name ?? "";
  const shown = playhead ?? lastIndex;
  const readout = {
    time: formatQuantity(times[shown] ?? 0, "s", locale),
    voltage: formatQuantity(response.voltage[shown] ?? 0, "V", locale),
    current: formatQuantity(response.current[shown] ?? 0, "A", locale),
  };

  const scrubTo = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setPlayhead(Math.round(fraction * lastIndex));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? Math.ceil(lastIndex / 20) : 1;
    const from = playhead ?? 0;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? from + step
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? from - step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? lastIndex
              : undefined;
    if (e.key === "Escape") setPlayhead(null);
    if (next === undefined) return;
    e.preventDefault();
    setPlayhead(Math.min(lastIndex, Math.max(0, next)));
  };

  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-xs font-medium text-muted-foreground">
          {t("title")}
        </h3>
        <p aria-hidden className="font-mono text-xs tabular-nums">
          {t("at", { time: readout.time })}
        </p>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("scrub")}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={shown}
        aria-valuetext={t("valueText", readout)}
        onPointerMove={scrubTo}
        onPointerDown={scrubTo}
        onPointerLeave={() => setPlayhead(null)}
        onBlur={() => setPlayhead(null)}
        onKeyDown={onKeyDown}
        className="grid cursor-crosshair touch-none gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <Plot
          label={t("voltage", { from: pinName(response.pins[0]), to: pinName(response.pins[1]) })}
          value={readout.voltage}
          series={response.voltage}
          playhead={playhead}
        />
        <Plot
          label={t(response.outward ? "currentOutOf" : "currentInto", { pin: pinName(response.currentPin) })}
          value={readout.current}
          series={response.current}
          playhead={playhead}
        />
        <div aria-hidden className="flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
          <span>{formatQuantity(0, "s", locale)}</span>
          <span>{stop}</span>
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {outcome.settled ? t("span", { time: stop }) : t("unsettled", { time: stop })} {t("hint")}
      </p>
    </section>
  );
};
