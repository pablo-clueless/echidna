import { describe, expect, it } from "vitest";

import { BOARD, freeBoardSpot } from "./placement";
import { footprints } from "./footprints";

const terminal = footprints["generic/terminal-2"]!;
const to92 = footprints["generic/to-92-ebc"]!;

describe("freeBoardSpot", () => {
  it("starts at the board centre", () => {
    expect(freeBoardSpot(to92, [])).toEqual({ x: 0, z: 0 });
  });

  it("keeps a new part's courtyard clear of placed parts", () => {
    const placed = [{ at: { x: 0, z: 0, rotation: 0 as const }, footprint: terminal }];
    const spot = freeBoardSpot(to92, placed);
    const [dx, dz] = [Math.abs(spot.x * 1000), Math.abs(spot.z * 1000)];
    const clearX = dx >= (terminal.courtyard.w + to92.courtyard.w) / 2;
    const clearZ = dz >= (terminal.courtyard.h + to92.courtyard.h) / 2;
    expect(clearX || clearZ).toBe(true);
  });

  it("accounts for a placed part's rotation", () => {
    const flat = freeBoardSpot(to92, [{ at: { x: 0, z: 0, rotation: 0 as const }, footprint: terminal }]);
    const turned = freeBoardSpot(to92, [{ at: { x: 0, z: 0, rotation: 90 as const }, footprint: terminal }]);
    expect(turned).not.toEqual(flat);
  });

  it("stays on the board and out of the mounting-hole corners as it fills up", () => {
    const placed: Parameters<typeof freeBoardSpot>[1] = [];
    for (let i = 0; i < 20; i++) {
      const spot = freeBoardSpot(terminal, placed);
      expect(Math.abs(spot.x * 1000) + terminal.courtyard.w / 2).toBeLessThanOrEqual(BOARD.width / 2);
      expect(Math.abs(spot.z * 1000) + terminal.courtyard.h / 2).toBeLessThanOrEqual(BOARD.depth / 2);
      placed.push({ at: { ...spot, rotation: 0 }, footprint: terminal });
    }
  });
});
