import type { BoardPlacement } from "@/lib/project/model";
import type { Footprint } from "./footprints";

/** Board size in millimetres: 100 × 70 mm, 1.6 mm FR-4. */
export const BOARD = { width: 100, depth: 70, thickness: 1.6 } as const;

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
 * @returns A position in metres, or the board centre when the board is full.
 */
export const freeBoardSpot = (
  footprint: Footprint,
  placed: { at: BoardPlacement; footprint: Footprint }[],
): { x: number; z: number } => {
  const taken = placed.map(({ at, footprint: f }) => courtyardAt(f, at.x * 1000, at.z * 1000, at.rotation));
  const [halfW, halfH] = [footprint.courtyard.w / 2 + GAP, footprint.courtyard.h / 2 + GAP];
  const [limitX, limitZ] = [BOARD.width / 2 - halfW, BOARD.depth / 2 - halfH];

  const candidates: [number, number][] = [];
  for (let x = -Math.floor(limitX / STEP) * STEP; x <= limitX; x += STEP) {
    for (let z = -Math.floor(limitZ / STEP) * STEP; z <= limitZ; z += STEP) candidates.push([x, z]);
  }
  candidates.sort(([ax, az], [bx, bz]) => Math.hypot(ax, az) - Math.hypot(bx, bz) || az - bz || ax - bx);

  for (const [x, z] of candidates) {
    const rect = courtyardAt(footprint, x, z, 0);
    const inCorner =
      Math.abs(x) + halfW > BOARD.width / 2 - CORNER_KEEPOUT && Math.abs(z) + halfH > BOARD.depth / 2 - CORNER_KEEPOUT;
    if (!inCorner && !taken.some((t) => overlaps(rect, t))) return { x: x / 1000, z: z / 1000 };
  }
  return { x: 0, z: 0 };
};
