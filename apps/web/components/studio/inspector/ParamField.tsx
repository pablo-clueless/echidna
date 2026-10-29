"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { SpecValue } from "@echidna/core";
import { RotateCcw } from "lucide-react";

import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { formatQuantity, parseQuantity } from "@/lib/units";
import { IconButton } from "@/components/app/IconButton";
import { ProvenanceBadge } from "./ProvenanceBadge";

type Props = {
  name: string;
  label: string;
  spec: SpecValue;
  value: number;
  overridden: boolean;
  onCommit: (value: number | undefined) => void;
};

/**
 * Edits one part parameter. Accepts the locale's decimal separator and SI prefixes (`4,7k` in French).
 */
export const ParamField = ({ name, label, spec, value, overridden, onCommit }: Props) => {
  const t = useTranslations("Studio.inspector");
  const locale = useLocale();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const unit = spec.unit === "1" ? "" : spec.unit;
  const shown = formatQuantity(value, unit, locale, 4).trim();
  const invalid = draft !== null && parseQuantity(draft, locale, unit) === null;

  const commit = () => {
    if (draft === null || cancelled.current) return;
    const parsed = parseQuantity(draft, locale, unit);
    if (parsed !== null && parsed !== value) onCommit(parsed);
    if (parsed !== null) setDraft(null);
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <ProvenanceBadge source={overridden ? "user" : spec.source} />
      </div>
      <div className="flex items-center gap-1">
        <InputGroup className="h-8">
          <InputGroupInput
            id={id}
            name={name}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tabular-nums"
            value={draft ?? shown}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onFocus={(e) => {
              cancelled.current = false;
              setDraft(shown);
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              commit();
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                cancelled.current = true;
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
          />
        </InputGroup>
        {overridden && (
          <IconButton label={t("resetParam")} onClick={() => onCommit(undefined)}>
            <RotateCcw />
          </IconButton>
        )}
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-status-fail-text">
          {t("invalidNumber")}
        </p>
      )}
    </div>
  );
};
