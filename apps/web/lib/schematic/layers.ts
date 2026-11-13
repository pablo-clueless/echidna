import type { ComponentSpec, HostSlot } from "@echidna/core";

import type { Rotation, SchematicPlacement } from "@/lib/project/model";
import { boundsOf, BOX_KINDS } from "./symbols";

/**
 * Lays a host's plugged-in parts out in the schematic the way they are built up: parts stacked on one another, such
 * as a cooler on its CPU or a phone's upper board on its interposer, draw as rows above the layer they sit on, and
 * parts side by side on the board draw side by side, in the order they are across it.
 */

/**
 * Where a plugged-in part sits: seated on one of the host's boards, joined to it by a flex cable away from the board,
 * or plugged into a header with no seat of its own, such as a sensor on a dev board's I²C pins.
 */
export type LayerGroup = "board" | "flex" | "header";

/** What a row of the layout holds, for its label. */
export type LayerLabel =
  | { key: "onBoard" | "flex" | "header" }
  /** One of the host's boards, by its `boards` ID, when the host has several. */
  | { key: "board"; board: string }
  /** Parts stacked on those below them, `layer` counting from 1 at the bottom. */
  | { key: "stacked"; layer: number };

/** A plugged-in part's place in the layout: its group, the column across it and the row up it, 0 at the bottom. */
export type LayerCell = { id: string; group: LayerGroup; column: number; row: number };

/** A row of one group, with the parts in it, for drawing a band behind them. */
export type LayerBand = { group: LayerGroup; row: number; label: LayerLabel; ids: string[] };

/** Groups in the order they are laid out, left to right: the board's own parts first, what hangs off it last. */
const GROUP_ORDER: readonly LayerGroup[] = ["board", "header", "flex"];

/** Seats closer than this, in millimetres, are the same place on the board: a part there stacks on the other. */
const SAME_SEAT_MM = 1;

const groupOf = (slot: HostSlot): LayerGroup =>
  slot.flex ? "flex" : slot.seat ? "board" : "header";

type Plugged = { id: string; slotId: string };

type Stack = {
  group: LayerGroup;
  board: number;
  /** Where on the board, in millimetres, to order stacks across it; none for a header. */
  at?: { x: number; z: number };
  /** Index of the first slot in the stack, which orders headers. */
  first: number;
  /** Bottom to top, in the host's slot order: a CPU before the cooler on it, motors before their propellers. */
  parts: { id: string; index: number }[];
};

/**
 * Groups a host's plugged-in parts into stacks, one per place on a board, and places each in a column and row.
 * @param host - The host's spec.
 * @param plugged - The parts in its slots, with the slot each is in.
 * @returns A cell per part whose slot the host has, and the rows of each group with their labels.
 */
export const hostLayers = (
  host: Pick<ComponentSpec, "host">,
  plugged: readonly Plugged[],
): { cells: LayerCell[]; bands: LayerBand[] } => {
  const slots = host.host?.slots ?? [];
  const boards = host.host?.boards ?? [];
  const stacks: Stack[] = [];
  for (const p of plugged) {
    const index = slots.findIndex((s) => s.id === p.slotId);
    const slot = slots[index];
    if (!slot) continue;
    const group = groupOf(slot);
    const board =
      group === "board"
        ? Math.max(
            0,
            boards.findIndex((b) => b.id === slot.board),
          )
        : 0;
    const at = slot.seat ? { x: slot.seat.x, z: slot.seat.z } : undefined;
    const stack =
      group === "header" || !at
        ? undefined
        : stacks.find(
            (s) =>
              s.group === group &&
              s.board === board &&
              s.at &&
              Math.hypot(s.at.x - at.x, s.at.z - at.z) < SAME_SEAT_MM,
          );
    if (stack) {
      stack.parts.push({ id: p.id, index });
      stack.first = Math.min(stack.first, index);
    } else {
      stacks.push({
        group,
        board,
        ...(at ? { at } : {}),
        first: index,
        parts: [{ id: p.id, index }],
      });
    }
  }

  // Each board's parts start on the row above the tallest stack on the boards below it.
  const depth = (s: Stack) => s.parts.length;
  const base: number[] = [];
  let next = 0;
  for (let b = 0; b < Math.max(boards.length, 1); b++) {
    base[b] = next;
    const tallest = Math.max(
      0,
      ...stacks.filter((s) => s.group === "board" && s.board === b).map(depth),
    );
    next += tallest;
  }

  const cells: LayerCell[] = [];
  const bands = new Map<string, LayerBand>();
  for (const group of GROUP_ORDER) {
    const across = stacks
      .filter((s) => s.group === group)
      .sort((a, b) =>
        a.at && b.at ? a.at.x - b.at.x || a.at.z - b.at.z || a.first - b.first : a.first - b.first,
      );
    across.forEach((stack, column) => {
      const offset = group === "board" ? (base[stack.board] ?? 0) : 0;
      [...stack.parts]
        .sort((a, b) => a.index - b.index)
        .forEach((part, level) => {
          const row = offset + level;
          cells.push({ id: part.id, group, column, row });
          const key = `${group}:${row}`;
          const label: LayerLabel =
            level > 0
              ? { key: "stacked", layer: row + 1 }
              : group === "board" && boards.length > 1
                ? { key: "board", board: boards[stack.board]?.id ?? "" }
                : group === "board"
                  ? row === 0
                    ? { key: "onBoard" }
                    : { key: "stacked", layer: row + 1 }
                  : { key: group };
          const band = bands.get(key);
          if (band) band.ids.push(part.id);
          else bands.set(key, { group, row, label, ids: [part.id] });
        });
    });
  }
  return { cells, bands: [...bands.values()] };
};

/** Grid units between columns, and between one group and the next. */
const COLUMN_GAP = 4;
const GROUP_GAP = 3;
/** Grid units between rows, with room above each box for its designator. */
const ROW_GAP = 3;

/** Half-extents of a part's symbol as placed, turned with it, with room for the pins of a box with leads. */
export const placedBounds = (spec: ComponentSpec, rotation: Rotation) => {
  const b = boundsOf(spec);
  const leads = BOX_KINDS.has(spec.kind) && spec.pins.length > 0 ? 2 : 0;
  const w = Math.ceil(b.w) + leads;
  const h = Math.ceil(b.h);
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
};

/**
 * Positions for a host's plugged-in parts: right of the host, top edge level with its top, rows stacked upwards
 * from the bottom layer, columns as wide as their widest part.
 * @param host - The host's placement and the half-extents of its symbol.
 * @param cells - From {@link hostLayers}.
 * @param boundsOfPart - Half-extents of each part's symbol as placed.
 * @returns A grid position for each part.
 */
export const arrangeLayers = (
  host: { at: Pick<SchematicPlacement, "x" | "y">; w: number; h: number },
  cells: readonly LayerCell[],
  boundsOfPart: (id: string) => { w: number; h: number },
): Map<string, { x: number; y: number }> => {
  const rows = Math.max(0, ...cells.map((c) => c.row + 1));
  const rowHalf = Array.from({ length: rows }, (_, r) =>
    Math.max(0, ...cells.filter((c) => c.row === r).map((c) => boundsOfPart(c.id).h)),
  );
  // From the top: the highest layer first, the bottom one last.
  const rowY: number[] = [];
  let top = host.at.y - host.h;
  for (let r = rows - 1; r >= 0; r--) {
    const half = rowHalf[r] ?? 0;
    if (half === 0) continue;
    rowY[r] = top + 1 + half;
    top = (rowY[r] ?? 0) + half + ROW_GAP - 1;
  }

  const placed = new Map<string, { x: number; y: number }>();
  let left = host.at.x + host.w + COLUMN_GAP + 1;
  for (const group of GROUP_ORDER) {
    const inGroup = cells.filter((c) => c.group === group);
    if (inGroup.length === 0) continue;
    const columns = Math.max(...inGroup.map((c) => c.column)) + 1;
    for (let column = 0; column < columns; column++) {
      const inColumn = inGroup.filter((c) => c.column === column);
      const half = Math.max(0, ...inColumn.map((c) => boundsOfPart(c.id).w));
      for (const c of inColumn) placed.set(c.id, { x: left + half, y: rowY[c.row] ?? host.at.y });
      left += half * 2 + COLUMN_GAP;
    }
    left += GROUP_GAP;
  }
  return placed;
};
