import { describe, expect, it } from "vitest";

import { neighbourValues } from "./swaps";

describe("neighbourValues", () => {
  it("offers E12 resistors either side of the current value", () => {
    expect(neighbourValues("resistor", 150)).toEqual([82, 100, 120, 180, 220, 270]);
  });

  it("crosses decade boundaries", () => {
    expect(neighbourValues("resistor", 1000, 2)).toEqual([680, 820, 1200, 1500]);
  });

  it("offers nothing for parts without a standard series", () => {
    expect(neighbourValues("led", 1)).toEqual([]);
    expect(neighbourValues("resistor", 0)).toEqual([]);
  });

  it("uses E6 for capacitors", () => {
    expect(neighbourValues("capacitor", 1e-5, 1)).toEqual([6.8e-6, 1.5e-5]);
  });
});
