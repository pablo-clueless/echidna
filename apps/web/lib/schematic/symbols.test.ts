import { describe, expect, it } from "vitest";
import { partsById } from "@echidna/library";

import { isModuleBox, MODULE_BOX, moduleBounds, moduleBoxSide } from "./symbols";

const spec = (id: string) => {
  const found = partsById.get(id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

describe("module boxes", () => {
  it("sizes a module's box by the part, larger parts larger", () => {
    const widths = ["imu-6axis", "apple-a16", "nvme-ssd-1tb", "b650-atx"].map(
      (id) => moduleBounds(spec(id)).w,
    );
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
  });

  it("keeps the smallest part readable and the largest on screen", () => {
    expect(moduleBoxSide(0.5)).toBe(MODULE_BOX.min);
    expect(moduleBoxSide(3)).toBe(MODULE_BOX.min);
    expect(moduleBoxSide(10_000)).toBe(MODULE_BOX.max);
    // Twice the size is a little under a grid unit larger.
    expect(moduleBoxSide(80) - moduleBoxSide(40)).toBe(1);
  });

  it("draws only lead-less slot modules as module boxes", () => {
    expect(isModuleBox(spec("apple-a16"))).toBe(true);
    expect(isModuleBox(spec("raspberry-pi-5"))).toBe(false);
    expect(isModuleBox(spec("resistor"))).toBe(false);
  });
});
