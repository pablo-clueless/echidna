"use client";

import type { Severity } from "@echidna/core";
import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

type Props = {
  resistance: string;
  ratio: number;
  severity: Severity;
  title: string;
};

const LOOP = "M60 60 H300 V140 H60 Z";
const PIXELS_PER_SECOND_AT_RATING = 110;

const flowClass: Record<Severity, string> = {
  pass: "stroke-status-pass-text",
  warn: "stroke-status-warn-text",
  fail: "stroke-status-fail-text",
};

export const CircuitDiagram = ({ resistance, ratio, severity, title }: Props) => {
  const flowRef = useRef<SVGPathElement>(null);
  const speed = useRef(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    speed.current = Math.min(ratio, 3) * PIXELS_PER_SECOND_AT_RATING;
  }, [ratio]);

  useEffect(() => {
    if (reduced) return;
    let offset = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      offset = (offset - (speed.current * (now - last)) / 1000) % 1000;
      last = now;
      flowRef.current?.setAttribute("stroke-dashoffset", offset.toFixed(2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const glow = Math.min(ratio, 1.6);

  return (
    <svg viewBox="0 20 360 136" role="img" aria-label={title} className="h-auto w-full">
      <defs>
        <radialGradient id="led-glow">
          <stop offset="0%" stopColor="#FF4D3D" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#FF4D3D" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FF4D3D" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={LOOP} fill="none" className="stroke-muted-foreground/45" strokeWidth={2} strokeLinejoin="round" />
      <path
        ref={flowRef}
        d={LOOP}
        fill="none"
        className={cn("transition-[stroke] duration-300", flowClass[severity])}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeDasharray="0 16"
      />

      <g>
        <rect x={44} y={86} width={32} height={26} className="fill-card" />
        <line x1={44} y1={92} x2={76} y2={92} className="stroke-foreground" strokeWidth={2.5} />
        <line x1={52} y1={104} x2={68} y2={104} className="stroke-foreground" strokeWidth={4} />
        <text x={30} y={102} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
          5 V
        </text>
        <text x={82} y={88} className="fill-muted-foreground font-mono text-[10px]">
          +
        </text>
      </g>

      <g>
        <rect x={146} y={48} width={68} height={24} className="fill-card" />
        <path
          d="M146 60 H152 L156 51 L164 69 L172 51 L180 69 L188 51 L196 69 L204 51 L208 60 H214"
          fill="none"
          className="stroke-foreground"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <text x={180} y={38} textAnchor="middle" className="fill-foreground font-mono text-[12px] font-medium">
          {resistance}
          <tspan className="font-sans"> Ω</tspan>
        </text>
      </g>

      <g>
        <circle
          cx={300}
          cy={98}
          r={14 + glow * 20}
          fill="url(#led-glow)"
          opacity={Math.min(1, 0.15 + glow * 0.7)}
          className={cn("transition-[r,opacity] duration-300", severity === "fail" && "motion-safe:animate-pulse")}
        />
        <path d="M288 87 H312 L300 107 Z" className="fill-card stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
        <line x1={287} y1={108} x2={313} y2={108} className="stroke-foreground" strokeWidth={2.5} />
        <path d="M318 90 l9 -7 m-4 0 h4 v4 M318 101 l9 -7 m-4 0 h4 v4" fill="none" className="stroke-muted-foreground" strokeWidth={1.5} />
        <text x={338} y={136} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">
          LED
        </text>
      </g>
    </svg>
  );
};
