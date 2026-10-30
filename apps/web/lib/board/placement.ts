import type { BoardPlacement, BoardSize } from "@/lib/project/model";
import type { Footprint } from "./footprints";

/** Default board in millimetres: 100 × 70 mm, 1.6 mm FR-4. */
export const BOARD = { width: 100, depth: 70, thickness: 1.6 } as const;
/** Smallest and largest board outline the studio offers, in millimetres. */
export const BOARD_LIMITS = { min: { width: 40, depth: 30 }, max: { width: 200, depth: 200 } } as const;
/** Part centres stay this far inside the board edge, in millimetres. */
const EDGE_MARGIN = 4;

/**
 * Rounds a board outline to whole millimetres within `BOARD_LIMITS`.
 * @param size - Requested outline in millimetres.
 * @returns The outline the board takes.
 */
export const clampBoardSize = ({ width, depth }: BoardSize): BoardSize => {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  return {
    width: clamp(width, BOARD_LIMITS.min.width, BOARD_LIMITS.max.width),
    depth: clamp(depth, BOARD_LIMITS.min.depth, BOARD_LIMITS.max.depth),
  };
};

/**
 * Keeps a part's centre on the board. Placements are in metres, as the project stores them.
 * @param x - Centre across the board, in metres.
 * @param z - Centre into the board, in metres.
 * @param size - Board outline in millimetres.
 * @returns The nearest position at least `EDGE_MARGIN` inside the edge.
 */
export const clampToBoard = (x: number, z: number, size: BoardSize): { x: number; z: number } => {
  const [hx, hz] = [(size.width / 2 - EDGE_MARGIN) / 1000, (size.depth / 2 - EDGE_MARGIN) / 1000];
  return { x: Math.min(hx, Math.max(-hx, x)), z: Math.min(hz, Math.max(-hz, z)) };
};

/** Gap kept between courtyards, and between a courtyard and the board edge, in millimetres. */
const GAP = 1;
/** Mounting holes and their rings take this much of each corner, in millimetres. */
const CORNER_KEEPOUT = 7;
const STEP = 2.5;

type Rect = { x: number; z: number; w: number; h: number };

const courtyardAt = (footprint: Footprint, x: number, z: number, rotation: number): Rect => {
  const turned = rotation % 180 !== 0;
  const { w, h } = footprint.courtyard;
  return { x, z, w: turned ? h : w, h: turned ? w : h };
};

const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.z - b.z) < (a.h + b.h) / 2 + GAP;

/**
 * The free board position closest to the centre where a new part's courtyard clears every placed part, the board
 * edge and the mounting holes. Placements are in metres, as the project stores them.
 * @param footprint - The new part's footprint.
 * @param placed - Parts already on the board, each with its footprint.
 * @param size - Board outline in millimetres.
 * @returns A position in metres, or the board centre when the board is full.
 */
export const freeBoardSpot = (
  footprint: Footprint,
  placed: { at: BoardPlacement; footprint: Footprint }[],
  size: BoardSize = BOARD,
): { x: number; z: number } => {
  const taken = placed.map(({ at, footprint: f }) => courtyardAt(f, at.x * 1000, at.z * 1000, at.rotation));
  const [halfW, halfH] = [footprint.courtyard.w / 2 + GAP, footprint.courtyard.h / 2 + GAP];
  const [limitX, limitZ] = [size.width / 2 - halfW, size.depth / 2 - halfH];

  const candidates: [number, number][] = [];
  for (let x = -Math.floor(limitX / STEP) * STEP; x <= limitX; x += STEP) {
    for (let z = -Math.floor(limitZ / STEP) * STEP; z <= limitZ; z += STEP) candidates.push([x, z]);
  }
  candidates.sort(([ax, az], [bx, bz]) => Math.hypot(ax, az) - Math.hypot(bx, bz) || az - bz || ax - bx);

  for (const [x, z] of candidates) {
    const rect = courtyardAt(footprint, x, z, 0);
    const inCorner =
      Math.abs(x) + halfW > size.width / 2 - CORNER_KEEPOUT && Math.abs(z) + halfH > size.depth / 2 - CORNER_KEEPOUT;
    if (!inCorner && !taken.some((t) => overlaps(rect, t))) return { x: x / 1000, z: z / 1000 };
  }
  return { x: 0, z: 0 };
};
