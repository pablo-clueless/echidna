import { describe, expect, it } from "vitest";
import { parts } from "@echidna/library";

import { footprints, resistorBands } from "./footprints";

describe("footprints", () => {
  it.each(parts.filter((p) => p.footprintId))("$id has a pad for every pin", (spec) => {
    const footprint = footprints[spec.footprintId];
    expect(footprint).toBeDefined();
    const padPins = new Set(footprint?.pads.map((p) => p.pin));
    expect(padPins).toEqual(new Set(spec.pins.map((p) => p.id)));
  });

  it("keeps pads inside the courtyard", () => {
    for (const { pads, courtyard } of Object.values(footprints)) {
      for (const pad of pads) {
        expect(Math.abs(pad.x) + pad.w / 2).toBeLessThanOrEqual(courtyard.w / 2);
        expect(Math.abs(pad.z) + pad.h / 2).toBeLessThanOrEqual(courtyard.h / 2);
      }
    }
  });
});

describe("resistorBands", () => {
  const [brown, green, gold] = ["#6B3A1E", "#2E8B57", "#C9A23F"];

  it("codes 150 Ω as brown, green, brown, gold", () => {
    expect(resistorBands(150)).toEqual([brown, green, brown, gold]);
  });

  it("codes 4.7 kΩ and 10 Ω", () => {
    expect(resistorBands(4700)).toEqual(["#F1C40F", "#7D3C98", "#C0392B", gold]);
    expect(resistorBands(10)).toEqual([brown, "#1B1B1B", "#1B1B1B", gold]);
  });

  it("uses a gold multiplier below 10 Ω", () => {
    expect(resistorBands(4.7)).toEqual(["#F1C40F", "#7D3C98", gold, gold]);
  });

  it("rounds to two significant digits", () => {
    expect(resistorBands(996)).toEqual([brown, "#1B1B1B", "#C0392B", gold]);
  });

  it("rejects values it cannot print", () => {
    expect(resistorBands(0)).toBeNull();
    expect(resistorBands(Number.NaN)).toBeNull();
    expect(resistorBands(1e12)).toBeNull();
  });
});
