"use client";

import { useMemo, type CSSProperties } from "react";
import { useLocale } from "next-intl";

import { useInView } from "./useInView";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  /** Colour of the sweeping block and the caret. Defaults to the signal colour. */
  block?: string;
};

type Segment = { text: string; chars: { ch: string; i: number }[] | null };

/** Total sweep time is capped so long headings (and translations) never drag. */
const MAX_SWEEP_MS = 1300;
const STEP_MS = 24;

/**
 * Splits text into word segments so words never break mid-reveal. `Intl.Segmenter` also finds word boundaries in
 * Chinese and Japanese, which have no spaces.
 */
const segment = (text: string, locale: string): { segments: Segment[]; count: number } => {
  let i = 0;
  const segments = [...new Intl.Segmenter(locale, { granularity: "word" }).segment(text)].map(({ segment: s }) => ({
    text: s,
    chars: /^\s+$/.test(s) ? null : [...s].map((ch) => ({ ch, i: i++ })),
  }));
  return { segments, count: i };
};

/**
 * A heading that types itself in when it scrolls into view: a solid block sweeps across the line, leaving the text
 * behind, and finishes as a blinking caret. Screen readers get the plain text.
 */
export const TypeHeading = ({ text, as: Tag = "h2", className, block = "var(--home-signal)" }: Props) => {
  const locale = useLocale();
  const [ref, phase] = useInView<HTMLHeadingElement>();
  const { segments, count } = useMemo(() => segment(text, locale), [text, locale]);

  const step = Math.min(STEP_MS, MAX_SWEEP_MS / Math.max(count, 1));
  const style = {
    "--type-block": block,
    "--type-step": `${step}ms`,
    "--type-dur": `${step * 4}ms`,
    "--type-total": `${step * count + 120}ms`,
  } as CSSProperties;

  return (
    <Tag ref={ref} data-phase={phase} style={style} className={cn("type-heading", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {segments.map((s, k) =>
          s.chars ? (
            <span key={k} className="whitespace-nowrap">
              {s.chars.map(({ ch, i }) => (
                <span key={i} className="type-char" style={{ "--i": i } as CSSProperties}>
                  {ch}
                </span>
              ))}
            </span>
          ) : (
            s.text
          ),
        )}
        <span
          className="type-caret ml-[0.06em] inline-block h-[0.82em] w-[0.09em] translate-y-[0.08em]"
          style={{ backgroundColor: block }}
        />
      </span>
    </Tag>
  );
};
