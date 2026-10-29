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
