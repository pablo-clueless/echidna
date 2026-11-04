import { describe, expect, it } from "vitest";

import { createPowerUp, FLASH, RAMP, STEP_GAP } from "./power";

const seq = createPowerUp(9);

describe("createPowerUp", () => {
  it("is dark before power-on", () => {
    expect(seq.stepAt(0, 0).level).toBe(0);
    expect(seq.litAt(0)).toBe(0);
    expect(seq.activeStepAt(-1)).toBe(-1);
  });

  it("brings parts alive one after another", () => {
    expect(seq.activeStepAt(0)).toBe(0);
    expect(seq.activeStepAt(STEP_GAP * 3 + 0.01)).toBe(3);
    expect(seq.stepAt(STEP_GAP * 3, 4).level).toBe(0);
    expect(seq.stepAt(STEP_GAP * 3 + RAMP + 0.001, 3).level).toBe(1);
  });

  it("flashes a part as it lights, then fades the flash", () => {
    expect(seq.stepAt(STEP_GAP + RAMP / 2, 1).flash).toBe(1);
    expect(seq.stepAt(STEP_GAP + RAMP + FLASH + 0.01, 1).flash).toBe(0);
  });

  it("is powered once every part is lit", () => {
    expect(seq.phaseAt(seq.done - 0.01)).toBe("booting");
    expect(seq.phaseAt(seq.done)).toBe("powered");
    expect(seq.litAt(seq.done)).toBe(9);
    expect(seq.activeStepAt(seq.done)).toBe(-1);
    for (let i = 0; i < 9; i++) expect(seq.stepAt(seq.settled, i).flash).toBe(0);
  });
});
