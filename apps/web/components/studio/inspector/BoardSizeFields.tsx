"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { BOARD_LIMITS } from "@/lib/board/placement";
import { useProjectStore } from "@/stores/project";
import { parseQuantity } from "@/lib/units";

type Axis = "width" | "depth";

const DimensionField = ({ axis, value, onCommit }: { axis: Axis; value: number; onCommit: (value: number) => void }) => {
  const t = useTranslations("Studio.inspector.board");
  const locale = useLocale();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = new Intl.NumberFormat(locale).format(value);
  const parsed = draft === null ? null : parseQuantity(draft, locale, "mm");
  const [min, max] = [BOARD_LIMITS.min[axis], BOARD_LIMITS.max[axis]];
  const invalid = draft !== null && (parsed === null || parsed < min || parsed > max);

  const commit = () => {
    if (draft === null || cancelled.current || invalid || parsed === null) return;
    if (parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {t(axis)}
      </label>
      <InputGroup className="h-8">
        <InputGroupInput
          id={id}
          name={`board-${axis}`}
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
          <InputGroupText>mm</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-status-fail-text">
          {t("outOfRange", { min, max })}
        </p>
      )}
    </div>
  );
};

/** Edits the board outline. Parts left outside a smaller board move in to its edge. */
export const BoardSizeFields = () => {
  const t = useTranslations("Studio.inspector.board");
  const boardSize = useProjectStore((s) => s.boardSize);
  const resizeBoard = useProjectStore((s) => s.resizeBoard);

  return (
    <section aria-labelledby="board-heading" className="grid gap-3 p-3">
      <h3 id="board-heading" className="text-xs font-medium text-muted-foreground">
        {t("title")}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {(["width", "depth"] as const).map((axis) => (
          <DimensionField
            key={axis}
            axis={axis}
            value={boardSize[axis]}
            onCommit={(value) => resizeBoard({ ...boardSize, [axis]: value })}
          />
        ))}
      </div>
    </section>
  );
};
