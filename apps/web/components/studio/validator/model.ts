import { compareViolations, type Violation } from "@echidna/core";

export type DrawerMode = "clean" | "peek" | "expanded";

export type VerdictKey = "fail" | "likelyFail" | "warn";

export const PEEK_COUNT = 2;

/**
 * Keeps only actionable violations (warn and fail), ordered worst first.
 * @param violations - Raw rule-engine output, including passes.
 * @returns Issues sorted for display.
 */
export const toIssues = (violations: readonly Violation[]): Violation[] =>
  violations.filter((v) => v.severity !== "pass").sort(compareViolations);

/**
 * Chooses how the validator drawer presents itself.
 * @param issueCount - Number of warn or fail issues.
 * @param expanded - Whether the user has expanded the drawer.
 * @returns `clean` when nothing is wrong, otherwise `peek` or `expanded`.
 */
export const drawerMode = (issueCount: number, expanded: boolean): DrawerMode =>
  issueCount === 0 ? "clean" : expanded ? "expanded" : "peek";

/**
 * Counts issues by severity for the drawer summary.
 * @param issues - Warn and fail issues.
 * @returns Fail and warn totals.
 */
export const countIssues = (issues: readonly Violation[]): { fails: number; warns: number } => ({
  fails: issues.filter((v) => v.severity === "fail").length,
  warns: issues.filter((v) => v.severity === "warn").length,
});

/**
 * Picks the message key for a verdict, softening fails that rest only on estimated data.
 * @param violation - A warn or fail issue.
 * @returns The `Studio.validator` message key for its label.
 */
export const verdictKey = (violation: Violation): VerdictKey =>
  violation.severity === "fail" ? (violation.estimated ? "likelyFail" : "fail") : "warn";
