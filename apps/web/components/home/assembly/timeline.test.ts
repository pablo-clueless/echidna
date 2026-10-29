import { describe, expect, it } from "vitest";

import { createTimeline, DROP, easeOutBack, STEP_GAP } from "./timeline";

const tl = createTimeline(9);

describe("createTimeline", () => {
  it("places steps one after another", () => {
    expect(tl.activeStepAt(0)).toBe(0);
    expect(tl.activeStepAt(STEP_GAP * 3 + 0.01)).toBe(3);
    expect(tl.stepAt(STEP_GAP * 3, 4).drop).toBe(0);
  });

  it("highlights a part while it drops, then fades", () => {
    expect(tl.stepAt(STEP_GAP + DROP / 2, 1).highlight).toBe(1);
    expect(tl.stepAt(STEP_GAP + DROP + 5, 1).highlight).toBe(0);
  });

  it("powers on once everything is seated and resets before the loop ends", () => {
    expect(tl.phaseAt(tl.assembled - 0.01)).toBe("assembling");
    expect(tl.placedAt(tl.assembled)).toBe(9);
    expect(tl.phaseAt(tl.assembled + 1)).toBe("powered");
    expect(tl.powerAt(tl.assembled + 1)).toBe(1);
    expect(tl.phaseAt(tl.cycle - 0.01)).toBe("resetting");
    expect(tl.powerAt(tl.cycle - 0.01)).toBe(0);
  });

  it("lifts every part clear by the end of the cycle", () => {
    for (let i = 0; i < 9; i++) expect(tl.stepAt(tl.cycle - 0.01, i).lift).toBe(1);
  });
});

describe("easeOutBack", () => {
  it("starts at 0, overshoots, and settles at 1", () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10);
    expect(Math.max(...[0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1, 10);
  });
});
