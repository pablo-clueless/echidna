import type { BoardSize, Rotation } from "@/lib/project/model";
import type { Footprint, Pad } from "@/lib/board/footprints";
import type { Point, Routing } from "@/lib/board/routing";

/** A part on the board, in board millimetres: x across and z deep from the board's centre, as the studio stores it. */
export type FabPart = {
  id: string;
  footprint: Footprint;
  x: number;
  z: number;
  rotation: Rotation;
};

/** What the fabrication files are drawn from. */
export type FabBoard = {
  size: BoardSize;
  parts: readonly FabPart[];
  routing: Routing;
  /** The copper net of each wired pad, by `part/pin`, as `pinKey` writes it. */
  padNets?: ReadonlyMap<string, string>;
  /** The net ground is on, which the copper pour joins. Without one, there is no pour. */
  groundNet?: string;
};

/**
 * Turns board millimetres (x across and z deep from the centre, z towards the viewer) into fabrication coordinates:
 * millimetres from the board's bottom-left corner with y up, as Gerber, drill and pick-and-place files expect.
 * @param size - Board outline.
 * @returns The mapping.
 */
export const toFab =
  ({ width, depth }: BoardSize) =>
  ([x, z]: Point): Point => [x + width / 2, depth / 2 - z];

/**
 * A footprint-local point placed on the board, turned the way `placePads` turns pads: clockwise seen from above.
 * @param part - The placed part.
 * @param local - Point in the footprint, x along the part and z across it.
 * @returns Board millimetres.
 */
export const place = (part: FabPart, [lx, lz]: Point): Point => {
  const angle = (-part.rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [part.x + lx * cos + lz * sin, part.z - lx * sin + lz * cos];
};

/**
 * A pad's size on the board, across and deep: a quarter turn swaps its sides.
 * @param pad - The footprint's pad.
 * @param rotation - The part's turn.
 * @param grow - Added on every side, as for a mask opening or a clearance.
 * @returns Width along x and depth along z, in millimetres.
 */
export const padSize = (pad: Pad, rotation: Rotation, grow = 0): [number, number] => {
  const [w, h] = [pad.w + grow * 2, pad.h + grow * 2];
  return rotation % 180 === 0 ? [w, h] : [h, w];
};
