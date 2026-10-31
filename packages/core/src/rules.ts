import type { Unit } from "./specs";

export type Severity = "pass" | "warn" | "fail";

export type Violation = {
  componentId: string;
  ruleId: string;
  actual: number;
  limit: number;
  unit: Unit;
  severity: Severity;
  estimated: boolean;
  /** Where the rating's headroom starts, such as the surrounding air for a temperature. Defaults to zero. */
  baseline?: number;
};

/**
 * How much of a rating's headroom is used: the share of the way from `baseline` to `limit` that `actual` has come.
 * @param v - The checked quantity, its rated limit and optional baseline.
 * @returns `actual / limit` without a baseline. A limit at or below the baseline is exceeded by anything above it.
 */
export const ratingRatio = (v: { actual: number; limit: number; baseline?: number | undefined }): number => {
  const base = v.baseline ?? 0;
  const headroom = v.limit - base;
  if (headroom <= 0) return v.actual > base ? Infinity : 0;
  return (v.actual - base) / headroom;
};

const severityRank: Record<Severity, number> = { pass: 0, warn: 1, fail: 2 };

/**
 * Orders violations worst first, with measured verdicts ahead of estimate-based ones at equal severity.
 * Used by the validator drawer, which peeks the first two.
 * @param a - First violation.
 * @param b - Second violation.
 * @returns A negative number when `a` should come first.
 */
export const compareViolations = (a: Violation, b: Violation): number =>
  severityRank[b.severity] - severityRank[a.severity] || Number(a.estimated) - Number(b.estimated);
