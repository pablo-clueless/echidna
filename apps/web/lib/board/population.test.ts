import { builds, partsById } from "@echidna/library";
import { describe, expect, it } from "vitest";

import { populate, PROFILES, type Rect, type SmallPart } from "./population";
import { hostSurfaces } from "./hostPopulation";

const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;

const host = (id: string) => {
  const spec = partsById.get(id);
  if (!spec) throw new Error(`no part ${id}`);
  return spec;
};

describe("populate", () => {
  const area = { width: 60, depth: 40 };
  const keepout: Rect = { x: 5, z: -3, w: 15, d: 12 };
  const parts = populate(area, [keepout], PROFILES.laptop, "test");

  it("lays the same board out the same way every time, and another seed differently", () => {
    expect(populate(area, [keepout], PROFILES.laptop, "test")).toEqual(parts);
    expect(populate(area, [keepout], PROFILES.laptop, "other")).not.toEqual(parts);
  });

  it("fills the board about as densely as its profile says", () => {
    const freeCm2 = (60 * 40 - 15 * 12) / 100;
    expect(parts.length).toBeGreaterThan(PROFILES.laptop.density * freeCm2 * 0.8);
    expect(parts.length).toBeLessThanOrEqual(Math.ceil(PROFILES.laptop.density * freeCm2) + 4);
  });

  it("keeps every part off the others, out of the keepout and inside the board edge", () => {
    const { edge } = PROFILES.laptop;
    for (const [i, p] of parts.entries()) {
      expect(overlaps(p, keepout), `${p.kind} at ${p.x},${p.z}`).toBe(false);
      expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(area.width / 2 - edge + 1e-9);
      expect(Math.abs(p.z) + p.d / 2).toBeLessThanOrEqual(area.depth / 2 - edge + 1e-9);
      for (const q of parts.slice(i + 1)) expect(overlaps(p, q)).toBe(false);
    }
  });

  it("mixes ICs, decoupling capacitors, resistors, inductors, a crystal and test points", () => {
    const kinds = new Set(parts.map((p) => p.kind));
    for (const kind of ["ic", "capacitor", "resistor", "inductor", "crystal", "testPoint"] as const)
      expect(kinds).toContain(kind);
  });

  it("rings a socket with power inductors", () => {
    const socket: Rect = { x: 0, z: 0, w: 20, d: 20 };
    const withVrm = populate({ width: 80, depth: 70 }, [socket], PROFILES.laptop, "vrm", socket);
    const near = withVrm.filter(
      (p) => p.kind === "inductor" && p.z < -10 && p.z > -18 && Math.abs(p.x) < 10,
    );
    expect(near.length).toBeGreaterThanOrEqual(2);
  });
});

describe("host surfaces", () => {
  const hosts = [...new Set(builds.map((b) => b.hostId))].map(host);
  const count = (surfaces: { parts: SmallPart[] }[]) =>
    surfaces.reduce((sum, s) => sum + s.parts.length, 0);

  it.each([
    ["motherboard", 1000],
    ["laptopBoard", 1000],
    ["phoneBoard", 300],
    // A fitness band's board is the size of a thumbnail.
    ["wearableBoard", 60],
  ] as const)("populates every %s in the presets with at least %d parts", (kind, least) => {
    const populated = hosts.filter((h) => h.kind === kind);
    expect(populated.length).toBeGreaterThan(0);
    for (const h of populated) expect(count(hostSurfaces(h, 1.6)), h.id).toBeGreaterThan(least);
  });

  it("leaves a drone's frame alone: it isn't a circuit board", () => {
    const frame = hosts.find((h) => h.kind === "droneFrame");
    expect(frame && hostSurfaces(frame, 0)).toEqual([]);
  });

  it("keeps every slot's seat clear", () => {
    const board = host("b650-atx");
    const [surface] = hostSurfaces(board, 1.6);
    for (const slot of board.host?.slots ?? []) {
      if (!slot.seat || slot.id === "cooler" || slot.id === "power") continue;
      const seat = { x: slot.seat.x, z: slot.seat.z, w: 1, d: 1 };
      expect(
        surface?.parts.some((p) => overlaps(p, seat)),
        slot.id,
      ).toBe(false);
    }
  });

  it("populates each board of a phone's stack", () => {
    const surfaces = hostSurfaces(host("iphone-15-board"), 0);
    expect(surfaces).toHaveLength(2);
    for (const s of surfaces) expect(s.parts.length).toBeGreaterThan(100);
  });
});
