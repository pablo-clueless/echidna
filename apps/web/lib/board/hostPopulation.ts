import type { ComponentSpec, HostSlot } from "@echidna/core";
import { parts } from "@echidna/library";

import { populate, PROFILES, type ProfileId, type Rect, type SmallPart } from "./population";
import { footprints } from "./footprints";

/** One board face covered in small parts: its centre and top, in millimetres from the host's origin. */
export type PopulatedSurface = { x: number; z: number; y: number; parts: SmallPart[] };

/** Which profile each kind of host board is populated with. */
const HOST_PROFILES: Partial<Record<string, ProfileId>> = {
  motherboard: "motherboard",
  laptopBoard: "laptop",
  phoneBoard: "phone",
  wearableBoard: "wearable",
};

/** Roles whose parts don't sit on the board's face: a cooler stands over the CPU, around parts that stay visible. */
const OFF_BOARD_ROLES = new Set(["cooler"]);
/** Roles whose slot is ringed with power stages. */
const SOCKET_ROLES = new Set(["cpu", "soc"]);

/**
 * The outline a slot keeps clear: the largest part that plugs into it, turned as the slot turns it.
 * @returns The outline, or `undefined` for a slot whose parts don't cover the board's face.
 */
const slotOutline = (slot: HostSlot): { w: number; d: number; role?: string } | undefined => {
  if (!slot.seat || slot.flex) return undefined;
  const accepts = new Set(slot.accepts.map((i) => `${i.protocol}@${i.connector ?? ""}`));
  const protocols = new Set(slot.accepts.map((i) => i.protocol));
  let best: { w: number; d: number; role?: string } | undefined;
  for (const spec of parts) {
    if (!spec.module) continue;
    const fits = spec.interfaces.some(
      (i) =>
        accepts.has(`${i.protocol}@${i.connector ?? ""}`) ||
        (protocols.has(i.protocol) && !i.connector),
    );
    if (!fits) continue;
    if (OFF_BOARD_ROLES.has(spec.module.role)) return undefined;
    const courtyard = footprints[spec.footprintId]?.courtyard;
    if (!courtyard) continue;
    const turned = (slot.seat.rotation ?? 0) % 180 !== 0;
    const [w, d] = turned ? [courtyard.h, courtyard.w] : [courtyard.w, courtyard.h];
    if (!best || w * d > best.w * best.d) best = { w, d, role: spec.module.role };
  }
  return best;
};

const cache = new Map<string, PopulatedSurface[]>();

/**
 * The small parts on a host board's faces: a motherboard's or laptop board's top, or each board of a phone's or
 * wearable's stack. Worked out once per host, as they never change.
 * @param spec - The host's spec.
 * @param boardTop - How far a single-board host's face stands above its origin, in millimetres.
 * @returns One surface per board; none for hosts that aren't populated boards, such as a drone's frame.
 */
export const hostSurfaces = (spec: ComponentSpec, boardTop: number): PopulatedSurface[] => {
  const cached = cache.get(spec.id);
  if (cached) return cached;
  const profileId = HOST_PROFILES[spec.kind];
  const host = spec.host;
  const courtyard = footprints[spec.footprintId]?.courtyard;
  if (!profileId || !host || !courtyard) return [];
  const profile = PROFILES[profileId];
  // Sockets and slots keep a little more room round them on a desktop board, for their latches and frames.
  const margin = profileId === "motherboard" ? 3 : profileId === "laptop" ? 1.5 : 0.4;

  const boards = host.boards?.length
    ? host.boards
    : [
        {
          id: "main",
          width: courtyard.w - 1,
          depth: courtyard.h - 1,
          x: 0,
          z: 0,
          y: boardTop,
          thickness: 0,
        },
      ];
  const surfaces = boards.map((board, index) => {
    const keepouts: Rect[] = [];
    let vrm: Rect | undefined;
    for (const slot of host.slots) {
      if ((slot.board ?? boards[0]?.id) !== board.id) continue;
      const outline = slotOutline(slot);
      if (!outline || !slot.seat) continue;
      const rect = {
        x: slot.seat.x - board.x,
        z: slot.seat.z - board.z,
        w: outline.w + margin * 2,
        d: outline.d + margin * 2,
      };
      keepouts.push(rect);
      if (outline.role && SOCKET_ROLES.has(outline.role) && profileId !== "wearable") vrm = rect;
    }
    // A board stacked on this one stands on an interposer frame round its edge.
    for (const upper of boards.slice(index + 1)) {
      if (upper.joint !== "interposer") continue;
      const [x, z, w, d, wall] = [
        upper.x - board.x,
        upper.z - board.z,
        upper.width,
        upper.depth,
        1.8,
      ];
      keepouts.push(
        { x, z: z - d / 2 + wall / 2, w, d: wall },
        { x, z: z + d / 2 - wall / 2, w, d: wall },
        { x: x - w / 2 + wall / 2, z, w: wall, d },
        { x: x + w / 2 - wall / 2, z, w: wall, d },
      );
    }
    return {
      x: board.x,
      z: board.z,
      y: board.y + board.thickness,
      parts: populate(
        { width: board.width, depth: board.depth },
        keepouts,
        profile,
        `${spec.id}/${board.id}`,
        vrm,
      ),
    };
  });
  cache.set(spec.id, surfaces);
  return surfaces;
};
