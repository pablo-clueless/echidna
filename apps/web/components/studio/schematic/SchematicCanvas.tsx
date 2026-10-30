"use client";

import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { compareViolations, type PinRef, type Severity } from "@echidna/core";
import { useLocale, useTranslations } from "next-intl";
import { partsById } from "@echidna/library";

import { GRID, PART_MIME, pinPositions, type Point, routeWire, valueParam } from "@/lib/schematic/symbols";
import { deriveNets, paramValue, pinKey, samePin } from "@/lib/project/model";
import { innerPinLabels, symbolBounds, SymbolGlyph } from "./SymbolGlyph";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";
import { formatQuantity } from "@/lib/units";
import { partKey } from "@/lib/messageKeys";
import { cn } from "@/lib/utils";

type View = { x: number; y: number; scale: number };

type Drag =
  | { kind: "move"; id: string; offset: Point; moved: boolean }
  | { kind: "pan"; start: Point; origin: View }
  | { kind: "wire"; from: PinRef; start: Point; cursor: Point; sticky: boolean };

type PinHit = { ref: PinRef; at: Point };

const PIN_HIT = 0.6;
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const FIT_MAX_SCALE = 1.6;

const severityClass: Record<Exclude<Severity, "pass">, string> = {
  fail: "stroke-status-fail",
  warn: "stroke-status-warn-border",
};

const toPoints = (pts: Point[]) => pts.map((p) => `${p.x * GRID},${p.y * GRID}`).join(" ");

/**
 * Interactive schematic: drag parts to move them, drag from one pin to another (or click both) to wire them,
 * Delete to remove the selection, R to rotate, arrow keys to nudge, and drag the background to pan.
 */
export const SchematicCanvas = () => {
  const t = useTranslations("Studio.schematic");
  const tParts = useTranslations("Parts");
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverPin, setHoverPin] = useState<string | null>(null);
  const size = useRef<{ width: number; height: number } | null>(null);
  /** True until the user pans or zooms, so resizing keeps the whole schematic in view. */
  const fitted = useRef(false);

  const components = useProjectStore((s) => s.components);
  const wires = useProjectStore((s) => s.wires);
  const schematic = useProjectStore((s) => s.schematic);
  const { addComponent, moveComponent, rotateComponent, removeComponent, removeWire, connect } =
    useProjectStore.getState();
  const selection = useStudioStore((s) => s.selection);
  const select = useStudioStore((s) => s.select);
  const violations = useStudioStore((s) => s.violations);
  const simulation = useStudioStore((s) => s.simulation);

  const pins = useMemo(() => {
    const hits: PinHit[] = [];
    for (const c of components) {
      const spec = partsById.get(c.specId);
      const placement = schematic[c.id];
      if (!spec || !placement) continue;
      pinPositions(spec.kind, placement).forEach((at, i) => {
        const pinId = spec.pins[i]?.id;
        if (pinId) hits.push({ ref: { componentId: c.id, pinId }, at });
      });
    }
    return hits;
  }, [components, schematic]);

  const pinAt = useMemo(() => new Map(pins.map((p) => [pinKey(p.ref), p.at])), [pins]);

  const worst = useMemo(() => {
    const map = new Map<string, { severity: Exclude<Severity, "pass">; estimated: boolean }>();
    for (const v of [...violations].sort(compareViolations)) {
      if (v.severity !== "pass" && !map.has(v.componentId))
        map.set(v.componentId, { severity: v.severity, estimated: v.estimated });
    }
    return map;
  }, [violations]);

  const netVoltage = useMemo(() => {
    const nets = deriveNets(wires);
    const voltages = new Map<string, number>();
    const solution = simulation?.solution;
    if (!solution || !simulation) return voltages;
    for (const net of nets) {
      const node = simulation.build.netNodes[net.id];
      const v = node === undefined ? undefined : solution.nodeVoltages[node];
      if (v !== undefined) for (const p of net.pins) voltages.set(pinKey(p), v);
    }
    return voltages;
  }, [wires, simulation]);

  const fit = () => {
    const svg = svgRef.current;
    if (!svg || pins.length === 0) return;
    const { width, height } = svg.getBoundingClientRect();
    const xs = pins.map((p) => p.at.x);
    const ys = pins.map((p) => p.at.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs) - 3, Math.max(...xs) + 3, Math.min(...ys) - 2, Math.max(...ys) + 2];
    const scale = Math.max(
      MIN_SCALE,
      Math.min(FIT_MAX_SCALE, width / ((maxX - minX) * GRID), height / ((maxY - minY) * GRID)),
    );
    fitted.current = true;
    setView({
      scale,
      x: width / 2 - ((minX + maxX) / 2) * GRID * scale,
      y: height / 2 - ((minY + maxY) / 2) * GRID * scale,
    });
  };

  const hasParts = components.length > 0;
  useEffect(() => {
    if (hasParts) fit();
    // Refit only when the schematic goes from empty to populated, such as loading the example.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasParts]);

  const onResize = useEffectEvent((width: number, height: number) => {
    const prev = size.current;
    size.current = { width, height };
    if (!prev || prev.width === 0 || (prev.width === width && prev.height === height)) return;
    if (fitted.current) {
      fit();
      return;
    }
    // After a manual pan or zoom, scale with the panel width and keep the same point at the centre.
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (v.scale * width) / prev.width));
      const cx = (prev.width / 2 - v.x) / v.scale;
      const cy = (prev.height / 2 - v.y) / v.scale;
      return { scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale };
    });
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) onResize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const toGrid = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: (e.clientX - left - view.x) / (GRID * view.scale),
      y: (e.clientY - top - view.y) / (GRID * view.scale),
    };
  };

  const nearestPin = (p: Point, except?: PinRef) =>
    pins.find((h) => (!except || !samePin(h.ref, except)) && Math.hypot(h.at.x - p.x, h.at.y - p.y) < PIN_HIT);

  const capture = (e: PointerEvent) => svgRef.current?.setPointerCapture(e.pointerId);

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    svgRef.current?.focus({ preventScroll: true });
    select(null);
    capture(e);
    setDrag({ kind: "pan", start: { x: e.clientX, y: e.clientY }, origin: view });
  };

  const onComponentDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    e.stopPropagation();
    const placement = schematic[id];
    if (!placement) return;
    if (drag?.kind === "wire" && drag.sticky) return;
    select({ kind: "component", id });
    svgRef.current?.focus({ preventScroll: true });
    const p = toGrid(e);
    capture(e);
    setDrag({ kind: "move", id, offset: { x: p.x - placement.x, y: p.y - placement.y }, moved: false });
  };

  const onPinDown = (e: PointerEvent, hit: PinHit) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    e.stopPropagation();
    svgRef.current?.focus({ preventScroll: true });
    if (drag?.kind === "wire" && drag.sticky) {
      connect(drag.from, hit.ref);
      setDrag(null);
      return;
    }
    capture(e);
    setDrag({ kind: "wire", from: hit.ref, start: hit.at, cursor: hit.at, sticky: false });
  };

  const onWireDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0 || e.defaultPrevented) return;
    e.stopPropagation();
    svgRef.current?.focus({ preventScroll: true });
    select({ kind: "wire", id });
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const p = toGrid(e);
    setHoverPin(nearestPin(p) ? pinKey((nearestPin(p) as PinHit).ref) : null);
    if (!drag) return;
    if (drag.kind === "pan") {
      fitted.current = false;
      setView({ ...drag.origin, x: drag.origin.x + e.clientX - drag.start.x, y: drag.origin.y + e.clientY - drag.start.y });
    } else if (drag.kind === "move") {
      const at = { x: Math.round(p.x - drag.offset.x), y: Math.round(p.y - drag.offset.y) };
      const current = schematic[drag.id];
      if (current && (current.x !== at.x || current.y !== at.y)) {
        moveComponent(drag.id, at);
        if (!drag.moved) setDrag({ ...drag, moved: true });
      }
    } else {
      setDrag({ ...drag, cursor: p });
    }
  };

  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag?.kind !== "wire") {
      setDrag(null);
      return;
    }
    if (drag.sticky) return;
    const p = toGrid(e);
    const target = nearestPin(p, drag.from);
    if (target) {
      connect(drag.from, target.ref);
      setDrag(null);
    } else if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < PIN_HIT) {
      setDrag({ ...drag, sticky: true });
    } else {
      setDrag(null);
    }
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * Math.exp(-e.deltaY * 0.0015)));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    fitted.current = false;
    setView({ scale, x: cx - ((cx - view.x) * scale) / view.scale, y: cy - ((cy - view.y) * scale) / view.scale });
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") {
      setDrag(null);
      select(null);
      return;
    }
    if (!selection) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selection.kind === "component") removeComponent(selection.id);
      else removeWire(selection.id);
      select(null);
      return;
    }
    if (selection.kind !== "component") return;
    const placement = schematic[selection.id];
    if (!placement) return;
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      rotateComponent(selection.id);
    }
    const step: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const d = step[e.key];
    if (d) {
      e.preventDefault();
      moveComponent(selection.id, { x: placement.x + d.x, y: placement.y + d.y });
    }
  };

  const onDrop = (e: DragEvent<SVGSVGElement>) => {
    const specId = e.dataTransfer.getData(PART_MIME);
    if (!specId) return;
    e.preventDefault();
    const p = toGrid(e);
    const id = addComponent(specId, { x: Math.round(p.x), y: Math.round(p.y) });
    if (id) select({ kind: "component", id });
    svgRef.current?.focus({ preventScroll: true });
  };

  const wireCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wires) for (const p of [w.a, w.b]) counts.set(pinKey(p), (counts.get(pinKey(p)) ?? 0) + 1);
    return counts;
  }, [wires]);

  const transform = `translate(${view.x} ${view.y}) scale(${view.scale})`;
  const wiring = drag?.kind === "wire" ? drag : null;

  return (
    <svg
      ref={svgRef}
      role="application"
      aria-label={t("canvasLabel")}
      aria-roledescription={t("canvasRole")}
      tabIndex={0}
      className={cn(
        "size-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        drag?.kind === "pan" && "cursor-grabbing",
        wiring && "cursor-crosshair",
      )}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || e.target instanceof SVGRectElement) fit();
      }}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(PART_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <defs>
        <pattern
          id="schematic-grid"
          width={GRID}
          height={GRID}
          patternUnits="userSpaceOnUse"
          patternTransform={transform}
        >
          <circle cx={0} cy={0} r={0.9} className="fill-border" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#schematic-grid)" />

      <g transform={transform} className="text-foreground" strokeLinecap="round" strokeLinejoin="round">
        {wires.map((w) => {
          const a = pinAt.get(pinKey(w.a));
          const b = pinAt.get(pinKey(w.b));
          if (!a || !b) return null;
          const points = toPoints(routeWire(a, b));
          const selected = selection?.kind === "wire" && selection.id === w.id;
          const v = netVoltage.get(pinKey(w.a));
          return (
            <g key={w.id} onPointerDown={(e) => onWireDown(e, w.id)} className="cursor-pointer">
              {v !== undefined && <title>{formatQuantity(v, "V", locale)}</title>}
              <polyline points={points} fill="none" stroke="transparent" strokeWidth={10} />
              <polyline
                points={points}
                fill="none"
                strokeWidth={selected ? 2.5 : 1.5}
                className={selected ? "stroke-primary" : "stroke-foreground/70"}
              />
            </g>
          );
        })}

        {components.map((c) => {
          const spec = partsById.get(c.specId);
          const placement = schematic[c.id];
          if (!spec || !placement) return null;
          const bounds = symbolBounds[spec.kind] ?? { w: 2, h: 1 };
          const vertical = placement.rotation % 180 !== 0;
          const [hw, hh] = vertical ? [bounds.h, bounds.w] : [bounds.w, bounds.h];
          const selected = selection?.kind === "component" && selection.id === c.id;
          const verdict = worst.get(c.id);
          const param = valueParam[spec.kind];
          const value = param === undefined ? undefined : paramValue(c, spec, param);
          const unit = param === undefined ? "" : (spec.params[param]?.unit ?? "");
          const label = value === undefined ? "" : formatQuantity(value, unit, locale);
          const labelX = vertical ? (placement.x + hw + 0.4) * GRID : placement.x * GRID;
          const labelY = vertical ? placement.y * GRID : (placement.y - hh - 0.5) * GRID;
          return (
            <g
              key={c.id}
              role="button"
              tabIndex={-1}
              aria-label={t("partLabel", { id: c.id, name: tParts(`${partKey(spec.id)}.name`) })}
              aria-pressed={selected}
              onPointerDown={(e) => onComponentDown(e, c.id)}
              className={cn("cursor-grab", drag?.kind === "move" && drag.id === c.id && "cursor-grabbing")}
            >
              {(selected || verdict) && (
                <rect
                  x={(placement.x - hw - 0.35) * GRID}
                  y={(placement.y - hh - 0.35) * GRID}
                  width={(hw + 0.35) * 2 * GRID}
                  height={(hh + 0.35) * 2 * GRID}
                  rx={6}
                  fill="none"
                  strokeWidth={selected ? 2 : 1.5}
                  strokeDasharray={verdict?.estimated && !selected ? "4 3" : undefined}
                  className={selected ? "stroke-primary" : verdict ? severityClass[verdict.severity] : undefined}
                />
              )}
              <rect
                x={(placement.x - hw) * GRID}
                y={(placement.y - hh) * GRID}
                width={hw * 2 * GRID}
                height={hh * 2 * GRID}
                fill="transparent"
              />
              <g
                transform={`translate(${placement.x * GRID} ${placement.y * GRID}) rotate(${placement.rotation})`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <SymbolGlyph kind={spec.kind} />
                {innerPinLabels[spec.kind]?.map((l) => (
                  <text
                    key={l.text}
                    x={l.x * GRID}
                    y={l.y * GRID}
                    transform={`rotate(${-placement.rotation} ${l.x * GRID} ${l.y * GRID})`}
                    textAnchor={l.anchor}
                    dominantBaseline="middle"
                    stroke="none"
                    className="fill-muted-foreground font-mono text-[8px]"
                  >
                    {l.text}
                  </text>
                ))}
              </g>
              <text
                x={labelX}
                y={labelY}
                textAnchor={vertical ? "start" : "middle"}
                dominantBaseline={vertical ? "middle" : "auto"}
                className="fill-foreground font-mono text-[10px]"
              >
                <tspan className="font-medium">{c.id}</tspan>
                {label && <tspan className="fill-muted-foreground">{` ${label}`}</tspan>}
              </text>
            </g>
          );
        })}

        {pins.map((p) => {
          const key = pinKey(p.ref);
          const count = wireCounts.get(key) ?? 0;
          const active = hoverPin === key || (wiring && samePin(wiring.from, p.ref));
          return (
            <circle
              key={key}
              cx={p.at.x * GRID}
              cy={p.at.y * GRID}
              r={active ? 4.5 : count >= 2 ? 3 : 2.5}
              onPointerDown={(e) => onPinDown(e, p)}
              className={cn(
                "cursor-crosshair",
                active ? "fill-primary" : count >= 2 ? "fill-foreground/70" : count === 0 ? "fill-background stroke-muted-foreground" : "fill-foreground/70",
              )}
              strokeWidth={count === 0 && !active ? 1 : 0}
            />
          );
        })}

        {wiring && (
          <polyline
            points={toPoints(routeWire(wiring.start, wiring.cursor))}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className="pointer-events-none stroke-primary"
          />
        )}
      </g>
    </svg>
  );
};
