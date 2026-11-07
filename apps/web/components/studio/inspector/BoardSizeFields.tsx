"use client";

import { useTranslations } from "next-intl";

import { BOARD_LIMITS } from "@/lib/board/placement";
import { useProjectStore } from "@/stores/project";
import { NumberField } from "./NumberField";

/**
 * What the project is built on. A PCB's outline can be edited, and parts left outside a smaller board move in to its
 * edge; a chassis's size is fixed, so it is only described.
 */
export const BoardSizeFields = () => {
  const t = useTranslations("Studio.inspector.board");
  const tFoundation = useTranslations("Studio.foundation");
  const foundation = useProjectStore((s) => s.foundation);
  const boardSize = useProjectStore((s) => s.boardSize);
  const resizeBoard = useProjectStore((s) => s.resizeBoard);

  return (
    <section aria-labelledby="board-heading" className="grid gap-3 p-3">
      <h3 id="board-heading" className="text-muted-foreground text-xs font-medium">
        {tFoundation(`names.${foundation}`)}
      </h3>
      {foundation === "pcb" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["width", "depth"] as const).map((axis) => {
            const [min, max] = [BOARD_LIMITS.min[axis], BOARD_LIMITS.max[axis]];
            return (
              <NumberField
                key={axis}
                label={t(axis)}
                name={`board-${axis}`}
                value={boardSize[axis]}
                unit="mm"
                min={min}
                max={max}
                outOfRange={t("outOfRange", { min, max })}
                onCommit={(value) => resizeBoard({ ...boardSize, [axis]: value })}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {tFoundation("fixedSize", { width: boardSize.width, depth: boardSize.depth })}
        </p>
      )}
    </section>
  );
};
