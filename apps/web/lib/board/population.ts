/**
 * The small parts every real board carries and nobody swaps: passives by the hundred, small ICs with their
 * decoupling capacitors, power inductors, crystals and test points. They are decoration, laid out from a seed so a
 * board looks the same every time it is drawn, and kept clear of the slots where the parts that are swapped sit.
 * Lengths in millimetres, x across and z deep from the board's centre.
 */

export type SmallPartKind =
  "resistor" | "capacitor" | "ic" | "bga" | "inductor" | "crystal" | "testPoint";

/** A small part, axis-aligned: `w` across and `d` deep, `h` tall above the board. */
export type SmallPart = {
  kind: SmallPartKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
};

/** A rectangle by its centre and size. */
export type Rect = { x: number; z: number; w: number; d: number };

/** Chip passive sizes by EIA code: length, width and height. */
export const PASSIVES = {
  "0201": [0.6, 0.3, 0.3],
  "0402": [1.0, 0.5, 0.35],
  "0603": [1.6, 0.8, 0.45],
  "0805": [2.0, 1.25, 0.6],
} as const satisfies Record<string, readonly [number, number, number]>;
export type PassiveSize = keyof typeof PASSIVES;

/** How a kind of board is populated. */
export type PopulationProfile = {
  /** Small parts per square centimetre of free board. */
  density: number;
  /** ICs per thousand square millimetres of free board. */
  ics: number;
  /** Smallest and largest QFN side, in millimetres. */
  qfn: readonly [number, number];
  /** Share of ICs that are BGAs, and their size range. */
  bga: { share: number; size: readonly [number, number] };
  /** Chip passive sizes, most common first, with their weights. */
  passives: readonly (readonly [PassiveSize, number])[];
  /** Power inductors per thousand square millimetres, and their side range. */
  inductors: { per1000: number; size: readonly [number, number] };
  /** Test points per thousand square millimetres. */
  testPoints: number;
  /** Gap kept between parts. */
  spacing: number;
  /** Margin kept from the board edge. */
  edge: number;
};

/**
 * Profiles by kind of board. Densities follow what teardowns show: a phone's logic board is packed edge to edge
 * with 0201 and 01005 parts; a desktop motherboard is sparse away from its sockets, with 0402 and 0603 parts and
 * rows of power inductors.
 */
export const PROFILES = {
  motherboard: {
    density: 4,
    ics: 0.4,
    qfn: [4, 9],
    bga: { share: 0.15, size: [12, 20] },
    passives: [
      ["0402", 5],
      ["0603", 3],
      ["0805", 1],
    ],
    inductors: { per1000: 0.12, size: [6, 10] },
    testPoints: 0.6,
    spacing: 0.35,
    edge: 6,
  },
  laptop: {
    density: 4.5,
    ics: 0.6,
    qfn: [3, 7],
    bga: { share: 0.2, size: [8, 14] },
    passives: [
      ["0402", 4],
      ["0201", 3],
      ["0603", 1],
    ],
    inductors: { per1000: 0.25, size: [4, 7] },
    testPoints: 1.5,
    spacing: 0.25,
    edge: 3,
  },
  card: {
    density: 5,
    ics: 0.5,
    qfn: [3, 6],
    bga: { share: 0.3, size: [9, 13] },
    passives: [
      ["0402", 4],
      ["0201", 2],
      ["0603", 1],
    ],
    inductors: { per1000: 0.3, size: [4, 7] },
    testPoints: 2,
    spacing: 0.25,
    edge: 1.5,
  },
  phone: {
    density: 30,
    ics: 1.6,
    qfn: [1.5, 4],
    bga: { share: 0.35, size: [4, 8] },
    passives: [
      ["0201", 6],
      ["0402", 2],
    ],
    inductors: { per1000: 0.8, size: [1.6, 2.5] },
    testPoints: 2.5,
    spacing: 0.15,
    edge: 0.6,
  },
  wearable: {
    density: 24,
    ics: 2,
    qfn: [1.2, 3],
    bga: { share: 0.3, size: [2.5, 4] },
    passives: [["0201", 1]],
    inductors: { per1000: 1, size: [1.2, 2] },
    testPoints: 2.5,
    spacing: 0.12,
    edge: 0.4,
  },
} as const satisfies Record<string, PopulationProfile>;
export type ProfileId = keyof typeof PROFILES;

/** A small, fast, seeded random number generator (mulberry32), so a board is populated the same way every time. */
const random = (seed: string) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Resolution of the grid parts are placed on, in millimetres. */
const CELL = 0.1;

/**
 * Lays small parts out over a board.
 * @param area - The board's outline, centred on the origin.
 * @param keepouts - Where nothing small may go: slots, connectors, interposer frames.
 * @param profile - How densely, and with what.
 * @param seed - Lays the same board out the same way every time.
 * @param vrm - Where a CPU or SoC socket is, to ring with power inductors and their MOSFETs as boards do.
 * @returns The parts, none overlapping each other, a keepout or the board edge.
 */
export const populate = (
  area: { width: number; depth: number },
  keepouts: readonly Rect[],
  profile: PopulationProfile,
  seed: string,
  vrm?: Rect,
): SmallPart[] => {
  const rand = random(seed);
  const between = ([lo, hi]: readonly [number, number]) => lo + rand() * (hi - lo);
  const cols = Math.ceil(area.width / CELL);
  const rows = Math.ceil(area.depth / CELL);
  const used = new Uint8Array(cols * rows);
  const toCol = (x: number) => Math.floor((x + area.width / 2) / CELL);
  const toRow = (z: number) => Math.floor((z + area.depth / 2) / CELL);

  /** Marks or tests a rectangle grown by `pad` on every side; returns false if any of it is taken or off the board. */
  const span = (r: Rect, pad: number) => {
    const [c0, c1] = [toCol(r.x - r.w / 2 - pad), toCol(r.x + r.w / 2 + pad)];
    const [r0, r1] = [toRow(r.z - r.d / 2 - pad), toRow(r.z + r.d / 2 + pad)];
    return { c0, c1, r0, r1 };
  };
  const free = (r: Rect) => {
    const { c0, c1, r0, r1 } = span(r, profile.spacing);
    if (
      r.x - r.w / 2 < -area.width / 2 + profile.edge ||
      r.x + r.w / 2 > area.width / 2 - profile.edge ||
      r.z - r.d / 2 < -area.depth / 2 + profile.edge ||
      r.z + r.d / 2 > area.depth / 2 - profile.edge
    )
      return false;
    for (let j = Math.max(0, r0); j <= Math.min(rows - 1, r1); j++)
      for (let i = Math.max(0, c0); i <= Math.min(cols - 1, c1); i++)
        if (used[j * cols + i]) return false;
    return true;
  };
  const take = (r: Rect) => {
    const { c0, c1, r0, r1 } = span(r, 0);
    for (let j = Math.max(0, r0); j <= Math.min(rows - 1, r1); j++)
      for (let i = Math.max(0, c0); i <= Math.min(cols - 1, c1); i++) used[j * cols + i] = 1;
  };
  for (const k of keepouts) take(k);

  const parts: SmallPart[] = [];
  const put = (part: SmallPart) => {
    if (!free(part)) return false;
    take(part);
    parts.push(part);
    return true;
  };
  const passiveSize = (): PassiveSize => {
    const total = profile.passives.reduce((sum, [, w]) => sum + w, 0);
    let pick = rand() * total;
    for (const [size, weight] of profile.passives) {
      pick -= weight;
      if (pick <= 0) return size;
    }
    return profile.passives[0]?.[0] ?? "0402";
  };
  const passive = (
    kind: "resistor" | "capacitor",
    x: number,
    z: number,
    along: boolean,
    size: PassiveSize,
  ) => {
    const [l, w, h] = PASSIVES[size];
    return put({ kind, x, z, w: along ? l : w, d: along ? w : l, h });
  };

  // Only the part of each keepout on the board takes room from it; a slot's outline can reach past the edge.
  const clipped = (k: Rect) =>
    Math.max(
      0,
      Math.min(k.x + k.w / 2, area.width / 2) - Math.max(k.x - k.w / 2, -area.width / 2),
    ) *
    Math.max(0, Math.min(k.z + k.d / 2, area.depth / 2) - Math.max(k.z - k.d / 2, -area.depth / 2));
  const freeArea = Math.max(
    0,
    area.width * area.depth - keepouts.reduce((sum, k) => sum + clipped(k), 0),
  );

  // Power stages round a socket: a row of inductors along two sides, each with a MOSFET package behind it.
  if (vrm) {
    const size = between(profile.inductors.size);
    const gap = size * 0.35;
    const sides = [
      {
        along: "x",
        fixed: vrm.z - vrm.d / 2 - size / 2 - 3,
        from: vrm.x - vrm.w / 2,
        to: vrm.x + vrm.w / 2,
      },
      {
        along: "z",
        fixed: vrm.x - vrm.w / 2 - size / 2 - 3,
        from: vrm.z - vrm.d / 2,
        to: vrm.z + vrm.d / 2,
      },
    ] as const;
    for (const side of sides)
      for (let t = side.from + size / 2; t + size / 2 <= side.to; t += size + gap) {
        const [x, z] = side.along === "x" ? [t, side.fixed] : [side.fixed, t];
        if (!put({ kind: "inductor", x, z, w: size, d: size, h: size * 0.55 })) continue;
        const fet = size * 0.6;
        const [fx, fz] =
          side.along === "x"
            ? [x, z + size / 2 + fet / 2 + 0.8]
            : [x + size / 2 + fet / 2 + 0.8, z];
        put({ kind: "ic", x: fx, z: fz, w: fet, d: fet * 0.8, h: 0.9 });
      }
  }

  // ICs, each with decoupling capacitors along its sides.
  const icCount = Math.round((profile.ics * freeArea) / 1000);
  for (let n = 0, tries = 0; n < icCount && tries < icCount * 40; tries++) {
    const bga = rand() < profile.bga.share;
    const s = between(bga ? profile.bga.size : profile.qfn);
    const [w, d] = bga ? [s, s] : rand() < 0.7 ? [s, s] : [s, s * between([1.3, 2])];
    const x = (rand() - 0.5) * area.width;
    const z = (rand() - 0.5) * area.depth;
    if (!put({ kind: bga ? "bga" : "ic", x, z, w, d, h: bga ? 1.1 : 0.8 })) continue;
    n++;
    const size = passiveSize();
    const [l, cw] = PASSIVES[size];
    const offset = cw / 2 + profile.spacing + 0.15;
    for (const [dx, dz, along] of [
      [0, -(d / 2 + offset), true],
      [0, d / 2 + offset, true],
      [-(w / 2 + offset), 0, false],
      [w / 2 + offset, 0, false],
    ] as const) {
      const length = along ? w : d;
      const count = Math.max(1, Math.floor(length / (l * 1.8)));
      for (let i = 0; i < count; i++) {
        if (rand() < 0.3) continue;
        const t = (i - (count - 1) / 2) * l * 1.8;
        // Decoupling capacitors stand across the IC's edge, their ends towards it.
        passive("capacitor", x + dx + (along ? t : 0), z + dz + (along ? 0 : t), !along, size);
      }
    }
  }

  // Power inductors on their own, with an output capacitor beside each.
  const inductorCount = Math.round((profile.inductors.per1000 * freeArea) / 1000);
  for (let n = 0, tries = 0; n < inductorCount && tries < inductorCount * 30; tries++) {
    const s = between(profile.inductors.size);
    const x = (rand() - 0.5) * area.width;
    const z = (rand() - 0.5) * area.depth;
    if (!put({ kind: "inductor", x, z, w: s, d: s, h: s * 0.5 })) continue;
    n++;
    passive("capacitor", x + s / 2 + 1.2, z, false, "0805");
  }

  // A crystal or two, and test points, each tried in a few places until it fits.
  const sprinkle = (count: number, make: (x: number, z: number) => SmallPart) => {
    for (let n = 0, tries = 0; n < count && tries < count * 20; tries++)
      if (put(make((rand() - 0.5) * area.width, (rand() - 0.5) * area.depth))) n++;
  };
  const [cw, cd] = profile.qfn[1] > 5 ? [5, 3.2] : [2, 1.6];
  sprinkle(Math.max(1, Math.round(freeArea / 4000)), (x, z) => ({
    kind: "crystal",
    x,
    z,
    w: cw,
    d: cd,
    h: 0.8,
  }));
  const tp = profile.qfn[0] > 2 ? 1 : 0.6;
  sprinkle(Math.round((profile.testPoints * freeArea) / 1000), (x, z) => ({
    kind: "testPoint",
    x,
    z,
    w: tp,
    d: tp,
    h: 0.03,
  }));

  // Rows of passives in clusters, as routed out from the ICs, until the board is as full as its profile says.
  const target = Math.round((profile.density * freeArea) / 100);
  for (let tries = 0; parts.length < target && tries < target * 6; tries++) {
    const size = passiveSize();
    const [, w] = PASSIVES[size];
    const along = rand() < 0.5;
    const kind = rand() < 0.55 ? "capacitor" : "resistor";
    const count = 2 + Math.floor(rand() * 8);
    const pitch = w + profile.spacing + 0.1;
    const x0 = (rand() - 0.5) * area.width;
    const z0 = (rand() - 0.5) * area.depth;
    // A row of parts side by side, each standing across the row, as resistor networks and bypass rows are laid.
    for (let i = 0; i < count && parts.length < target; i++) {
      const [x, z] = along ? [x0 + i * pitch, z0] : [x0, z0 + i * pitch];
      if (!passive(kind, x, z, !along, size)) break;
    }
  }
  return parts;
};
