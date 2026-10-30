import { describe, expect, it } from "vitest";

import { BOARD, BOARD_LIMITS, clampBoardSize, clampToBoard, freeBoardSpot } from "./placement";
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

  it("fits a part on a resized board", () => {
    const small = { width: 40, depth: 30 };
    const spot = freeBoardSpot(terminal, [{ at: { x: 0, z: 0, rotation: 0 as const }, footprint: to92 }], small);
    expect(Math.abs(spot.x * 1000) + terminal.courtyard.w / 2).toBeLessThanOrEqual(small.width / 2);
    expect(Math.abs(spot.z * 1000) + terminal.courtyard.h / 2).toBeLessThanOrEqual(small.depth / 2);
  });
});

describe("clampBoardSize", () => {
  it("rounds to whole millimetres within the limits", () => {
    expect(clampBoardSize({ width: 80.4, depth: 55.6 })).toEqual({ width: 80, depth: 56 });
    expect(clampBoardSize({ width: 1, depth: 1000 })).toEqual({ width: BOARD_LIMITS.min.width, depth: BOARD_LIMITS.max.depth });
  });
});

describe("clampToBoard", () => {
  it("moves a part off the edge back onto the board", () => {
    expect(clampToBoard(0.045, -0.03, { width: 60, depth: 40 })).toEqual({ x: 0.026, z: -0.016 });
    expect(clampToBoard(0.01, 0.005, { width: 60, depth: 40 })).toEqual({ x: 0.01, z: 0.005 });
  });
});
