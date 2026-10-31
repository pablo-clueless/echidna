import { describe, expect, it } from "vitest";

import { heatColour, heatGradient, heatOpacity, HEAT_RANGE } from "./heat";

describe("heat overlay scale", () => {
  it("hits each stop and blends between them", () => {
    expect(heatColour(25)).toBe("#fde047");
    expect(heatColour(60)).toBe("#ef4444");
    expect(heatColour(42.5)).toBe("#f69246");
  });

  it("holds the end colours outside the scale", () => {
    expect(heatColour(-10)).toBe(heatColour(25));
    expect(heatColour(400)).toBe(heatColour(150));
  });

  it("glows only with heat given off, up to a ceiling", () => {
    expect(heatOpacity(0)).toBe(0);
    expect(heatOpacity(-5)).toBe(0);
    expect(heatOpacity(10)).toBeCloseTo(0.425);
    expect(heatOpacity(100)).toBe(0.85);
  });

  it("spans the whole scale in the legend gradient", () => {
    const gradient = heatGradient();
    expect(gradient).toMatch(/^linear-gradient\(to right, #fde047 0%/);
    expect(gradient).toContain(`${heatColour(HEAT_RANGE.high)} 100%`);
  });
});
