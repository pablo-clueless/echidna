"use client";

import { useId, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { parseQuantity } from "@/lib/units";

type Props = {
  label: string;
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  /** Shown when the typed value is not a number or falls outside `min` to `max`. */
  outOfRange: string;
  onCommit: (value: number) => void;
};

/**
 * A number typed in the user's locale, committed on Enter or blur when it is within range. Escape discards the edit.
 * `value`, `min` and `max` are in the units shown, not SI.
 */
export const NumberField = ({ label, name, value, unit, min, max, outOfRange, onCommit }: Props) => {
  const locale = useLocale();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = new Intl.NumberFormat(locale).format(value);
  const parsed = draft === null ? null : parseQuantity(draft, locale, unit);
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);

  const commit = () => {
    if (draft === null || cancelled.current || invalid || parsed === null) return;
    if (parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
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
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-status-fail-text">
          {outOfRange}
        </p>
      )}
    </div>
  );
};
