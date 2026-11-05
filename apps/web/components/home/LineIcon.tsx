import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

type Props = {
  kind: "connects" | "powered" | "cool";
  className?: string;
};

const n = (value: number) => ({ "--n": value }) as CSSProperties;

/**
 * Animated line art for the three checks: interlocking pins for "connects", rings radiating from a source for
 * "powered" and layers of heat lifting away for "cool". Motion is defined in globals.css.
 */
export const LineIcon = ({ kind, className }: Props) => (
  <svg
    aria-hidden
    viewBox="0 0 120 120"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={cn("line-icon overflow-visible", className)}
  >
    {kind === "connects" && (
      <>
        <g className="comb-top">
          <path d="M22 12 H98" />
          {[30, 45, 60, 75, 90].map((x) => (
            <path key={x} d={`M${x} 12 V62`} />
          ))}
        </g>
        <g className="comb-bottom">
          <path d="M22 108 H98" />
          {[37.5, 52.5, 67.5, 82.5].map((x) => (
            <path key={x} d={`M${x} 108 V58`} />
          ))}
        </g>
      </>
    )}

    {kind === "powered" && (
      <>
        <circle cx={60} cy={60} r={8} />
        {[0, 1, 2].map((i) => (
          <circle key={i} className="ring" style={n(i)} cx={60} cy={60} r={9} />
        ))}
        <circle cx={60} cy={60} r={54} strokeDasharray="2 6" opacity={0.6} />
      </>
    )}

    {kind === "cool" &&
      [0, 1, 2, 3].map((i) => {
        const y = 86 - i * 16;
        return (
          <path
            key={i}
            className="layer"
            style={n(3 - i)}
            d={`M60 ${y - 15} L100 ${y} L60 ${y + 15} L20 ${y} Z`}
          />
        );
      })}
  </svg>
);
