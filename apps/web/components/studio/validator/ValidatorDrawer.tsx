"use client";

import { ChevronDown, ChevronUp, CircleCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { Violation } from "@echidna/core";
import { useMemo } from "react";

import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { countIssues, drawerMode, PEEK_COUNT, toIssues, verdictKey } from "./model";
import { useLayoutStore } from "@/stores/layout";
import { useStudioStore } from "@/stores/studio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const dotClass = {
  fail: "bg-status-fail",
  likelyFail: "bg-status-fail/50 ring-1 ring-status-fail",
  warn: "bg-status-warn ring-1 ring-status-warn-border",
} as const;

const textClass = {
  fail: "text-status-fail-text",
  likelyFail: "text-status-fail-text",
  warn: "text-status-warn-text",
} as const;

const IssueRow = ({ issue }: { issue: Violation }) => {
  const t = useTranslations("Studio.validator");
  const format = useFormatter();
  const selectComponent = useStudioStore((s) => s.selectComponent);
  const verdict = verdictKey(issue);
  const value = (n: number) => format.number(n, { maximumSignificantDigits: 4 });

  return (
    <Item asChild size="xs" className="w-full text-left hover:bg-muted">
      <button type="button" onClick={() => selectComponent(issue.componentId)}>
        <ItemMedia>
          <span aria-hidden className={cn("size-2 rounded-full", dotClass[verdict])} />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>
            <span className="font-mono">{issue.componentId}</span>
            <span className="truncate font-normal text-muted-foreground">{issue.ruleId}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions className="gap-3">
          {issue.estimated && <span className="text-xs text-muted-foreground italic">{t("estimated")}</span>}
          <span className="font-mono text-sm tabular-nums">
            {value(issue.actual)} / {value(issue.limit)} {issue.unit}
          </span>
          <span className={cn("min-w-24 text-right text-xs font-medium whitespace-nowrap", textClass[verdict])}>
            {t(verdict)}
          </span>
        </ItemActions>
      </button>
    </Item>
  );
};

export const ValidatorDrawer = () => {
  const t = useTranslations("Studio.validator");
  const violations = useStudioStore((s) => s.violations);
  const expanded = useLayoutStore((s) => s.validatorExpanded);
  const setExpanded = useLayoutStore((s) => s.setValidatorExpanded);

  const issues = useMemo(() => toIssues(violations), [violations]);
  const mode = drawerMode(issues.length, expanded);
  const { fails, warns } = countIssues(issues);

  if (mode === "clean") {
    return (
      <section aria-label={t("label")} className="flex h-9 shrink-0 items-center gap-2 border-t px-3 text-sm">
        <CircleCheck className="size-4 text-status-pass-text" aria-hidden />
        <span className="text-muted-foreground">{t("allPassed")}</span>
      </section>
    );
  }

  const shown = mode === "expanded" ? issues : issues.slice(0, PEEK_COUNT);

  return (
    <section aria-label={t("label")} className="flex shrink-0 flex-col border-t">
      <div className="flex h-9 items-center gap-2 px-3">
        <h2 className="text-sm font-medium">{t("label")}</h2>
        {fails > 0 && (
          <Badge className="bg-status-fail text-status-fail-foreground">{t("fails", { count: fails })}</Badge>
        )}
        {warns > 0 && (
          <Badge className="border-status-warn-border bg-status-warn text-status-warn-foreground">
            {t("warns", { count: warns })}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={mode === "expanded"}
        >
          {mode === "expanded" ? <ChevronDown data-icon="inline-start" /> : <ChevronUp data-icon="inline-start" />}
          {mode === "expanded" ? t("collapse") : t("expand")}
        </Button>
      </div>
      <ItemGroup className={cn("gap-0 px-1 pb-1", mode === "expanded" && "max-h-[min(40vh,20rem)] overflow-y-auto")}>
        {shown.map((issue) => (
          <IssueRow key={`${issue.componentId}:${issue.ruleId}`} issue={issue} />
        ))}
      </ItemGroup>
    </section>
  );
};
