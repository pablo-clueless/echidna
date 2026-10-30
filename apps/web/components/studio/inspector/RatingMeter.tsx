"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { Violation } from "@echidna/core";

import { usePreferencesStore } from "@/stores/preferences";
import { verdictKey } from "../validator/model";
import { formatQuantity } from "@/lib/units";
import { ruleKey } from "@/lib/messageKeys";
import { cn } from "@/lib/utils";

const fillClass = {
  pass: "bg-status-pass",
  warn: "bg-status-warn",
  fail: "bg-status-fail",
} as const;

const textClass = {
  pass: "text-status-pass-text",
  warn: "text-status-warn-text",
  fail: "text-status-fail-text",
  likelyFail: "text-status-fail-text",
} as const;

/** Current below this, in amperes, is solver leakage through an open or bypassed part, not current it carries. */
const NO_CURRENT = 1e-8;

/** One rating check for the selected part: actual against rated value, as a bar with a verdict. */
export const RatingMeter = ({ violation }: { violation: Violation }) => {
  const t = useTranslations("Studio");
  const format = useFormatter();
  const locale = useLocale();
  const learnMode = usePreferencesStore((s) => s.learnMode);
  const ratio = violation.actual / violation.limit;
  const idle = violation.unit === "A" && violation.actual < NO_CURRENT;
  const verdict = violation.severity === "pass" ? "pass" : verdictKey(violation);
  const percent = format.number(ratio, { style: "percent", maximumFractionDigits: 0 });

  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{t(`rules.${ruleKey(violation.ruleId)}.name`)}</span>
        {idle ? (
          <span className="font-medium text-muted-foreground">{t("inspector.verdict.noCurrent")}</span>
        ) : (
          <span className={cn("font-medium", textClass[verdict])}>{t(`inspector.verdict.${verdict}`)}</span>
        )}
      </div>
      <div
        role="meter"
        aria-label={t(`rules.${ruleKey(violation.ruleId)}.name`)}
        aria-valuemin={0}
        aria-valuemax={violation.limit}
        aria-valuenow={violation.actual}
        aria-valuetext={t("inspector.ofRating", { percent, limit: formatQuantity(violation.limit, violation.unit, locale) })}
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", fillClass[violation.severity])}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
        <div aria-hidden className="absolute inset-y-0 left-[80%] w-px bg-foreground/30" />
      </div>
      <div className="flex justify-between gap-2 font-mono text-xs text-muted-foreground tabular-nums">
        <span>
          {formatQuantity(violation.actual, violation.unit, locale)} / {formatQuantity(violation.limit, violation.unit, locale)}
        </span>
        <span>{percent}</span>
      </div>
      {learnMode && violation.severity !== "pass" && (
        <p className="text-xs text-muted-foreground">{t(`rules.${ruleKey(violation.ruleId)}.explain`, { percent })}</p>
      )}
    </div>
  );
};
