import { parts, partsById } from "@echidna/library";
import { describe, expect, it } from "vitest";

import type { ProjectData } from "./model";
import { slotSwaps } from "./slots";

const project = (hostSpec: string, plugged: Array<[string, string, string, string]>): Pick<ProjectData, "components" | "slots"> => ({
  components: [{ id: "B1", specId: hostSpec }, ...plugged.map(([id, specId]) => ({ id, specId }))],
  slots: Object.fromEntries(plugged.map(([id, , slotId, railId]) => [id, { hostId: "B1", slotId, railId, wireIds: [] }])),
});

const verdicts = (swaps: ReturnType<typeof slotSwaps>) => Object.fromEntries(swaps.map((s) => [s.specId, s.fits]));

describe("slotSwaps", () => {
  it("checks every other sensor against the slot a plugged-in sensor is in", () => {
    const swaps = slotSwaps(project("raspberry-pi-4", [["S1", "ds18b20", "gpio", "3v3"]]), partsById, parts, "S1");
    // The HC-SR04's 5 V echo is too much for the Pi's pins; the BME280 speaks I²C, not GPIO.
    expect(verdicts(swaps)).toEqual({ bme280: false, "hc-sr04": false });
    expect(swaps.find((s) => s.specId === "hc-sr04")?.byPart.S1?.checks.find((c) => c.severity === "fail")?.id).toBe("logicIntoHost");
  });

  it("offers nothing for a sensor in no slot", () => {
    expect(slotSwaps(project("raspberry-pi-4", []), partsById, parts, "B1")).toEqual([]);
  });

  it("checks every other host against everything plugged into this one", () => {
    const swaps = slotSwaps(project("raspberry-pi-4", [["S1", "bme280", "i2c", "3v3"]]), partsById, parts, "B1");
    // The Arduino drives its I²C pins at 5 V, past the BME280's 3.6 V.
    expect(verdicts(swaps)).toEqual({ "raspberry-pi-5": true, "esp32-devkitc": true, "arduino-uno-r4": false });
    expect(swaps.find((s) => s.specId === "arduino-uno-r4")?.byPart.S1?.fits).toBe(false);
  });
});
