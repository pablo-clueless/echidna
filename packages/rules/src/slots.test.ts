import { initSync, solveDc } from "@echidna/solver/wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { partsById, toCircuit } from "@echidna/library";
import type { DcSolution } from "@echidna/solver/types";
import type { ComponentSpec } from "@echidna/core";
import { readFileSync } from "node:fs";

import { checkSlotFit } from "./slots";

const part = (id: string): ComponentSpec => {
  const spec = partsById.get(id);
  if (!spec) throw new Error(`no part ${id}`);
  return spec;
};

const verdicts = (host: string, slot: string, sensor: string, loads = {}) => {
  const fit = checkSlotFit(part(host), slot, part(sensor), loads);
  return { ...fit, by: Object.fromEntries(fit.checks.map((c) => [c.id, c])) };
};

describe("checkSlotFit", () => {
  it("fits a 3.3 V I²C sensor on a Raspberry Pi's I²C header, powered from 3.3 V", () => {
    const fit = verdicts("raspberry-pi-4", "i2c", "bme280");
    expect(fit.fits).toBe(true);
    expect(fit.railId).toBe("3v3");
    expect(fit.checks.every((c) => c.severity === "pass")).toBe(true);
  });

  it("blocks a 5 V ultrasonic sensor on a Raspberry Pi: its echo would drive 5 V into a 3.3 V pin", () => {
    const fit = verdicts("raspberry-pi-4", "gpio", "hc-sr04");
    expect(fit.fits).toBe(false);
    expect(fit.railId).toBe("5v");
    expect(fit.by.logicIntoHost).toMatchObject({ severity: "fail", actual: 5, limit: 3.3, unit: "V" });
    expect(fit.by.supply?.severity).toBe("pass");
  });

  it("blocks a 3.3 V sensor on a 5 V Arduino's I²C pins, which would drive it past its interface limit", () => {
    const fit = verdicts("arduino-uno-r4", "i2c", "bme280");
    expect(fit.fits).toBe(false);
    expect(fit.railId).toBe("3v3");
    expect(fit.by.logicIntoPart).toMatchObject({ severity: "fail", actual: 5, limit: 3.6 });
  });

  it("fits the 5 V ultrasonic sensor on the Arduino, whose pins work at 5 V", () => {
    expect(verdicts("arduino-uno-r4", "gpio", "hc-sr04").fits).toBe(true);
  });

  it("blocks a part whose protocol the slot does not carry, and says what it accepts", () => {
    const fit = verdicts("esp32-devkitc", "i2c", "ds18b20");
    expect(fit.fits).toBe(false);
    expect(fit.by.interface).toMatchObject({ severity: "fail", protocols: ["1-wire"], accepts: ["i2c"] });
  });

  it("fails the supply check when no rail is in the part's range", () => {
    const narrow: ComponentSpec = {
      ...part("bme280"),
      supply: { ...part("bme280").supply!, minVoltage: { value: 1.8, unit: "V", source: "datasheet" }, maxVoltage: { value: 2, unit: "V", source: "datasheet" } },
    };
    const fit = checkSlotFit(part("raspberry-pi-4"), "i2c", narrow);
    expect(fit.fits).toBe(false);
    expect(fit.checks.find((c) => c.id === "supply")).toMatchObject({ severity: "fail", min: 1.8, limit: 2, offered: [3.3, 5] });
  });

  it("warns as a rail nears its limit and fails past it, counting what is already plugged in", () => {
    expect(verdicts("arduino-uno-r4", "gpio", "ds18b20", { "5v": 0.4 }).by.railCurrent?.severity).toBe("warn");
    const over = verdicts("arduino-uno-r4", "gpio", "ds18b20", { "5v": 0.5 });
    expect(over.fits).toBe(false);
    expect(over.by.railCurrent).toMatchObject({ severity: "fail", limit: 0.5 });
  });

  it("flags checks resting on estimated values", () => {
    expect(verdicts("raspberry-pi-4", "i2c", "bme280").by.railCurrent?.estimated).toBe(true);
    expect(verdicts("raspberry-pi-4", "i2c", "bme280").by.logicIntoPart?.estimated).toBe(false);
  });

  it("does not fit a part with no supply, or an unknown slot", () => {
    expect(checkSlotFit(part("raspberry-pi-4"), "i2c", part("resistor")).fits).toBe(false);
    expect(checkSlotFit(part("raspberry-pi-4"), "nope", part("bme280")).fits).toBe(false);
  });
});

describe("solving a host board with a sensor plugged in", () => {
  beforeAll(() => {
    initSync({ module: readFileSync(new URL("../../solver/wasm/solver_bg.wasm", import.meta.url)) });
  });

  it("supplies the sensor's current from the rail it is wired to", () => {
    const build = toCircuit(
      {
        groundNetId: "",
        components: [
          { id: "B1", specId: "raspberry-pi-4" },
          { id: "S1", specId: "bme280" },
        ],
        nets: [
          { id: "vdd", pins: [{ componentId: "B1", pinId: "3v3" }, { componentId: "S1", pinId: "vdd" }] },
          { id: "gnd", pins: [{ componentId: "B1", pinId: "gnd" }, { componentId: "S1", pinId: "gnd" }] },
        ],
      },
      partsById,
    );
    const solution = solveDc(build.circuit) as DcSolution;
    expect(build.netNodes.gnd).toBe("0");
    expect(solution.nodeVoltages["n:vdd"]).toBeCloseTo(3.3, 9);
    expect(Math.abs(solution.pinCurrents["B1:3v3"]?.[0] ?? 0)).toBeCloseTo(0.000714, 9);
    expect(solution.componentPower.S1).toBeCloseTo(3.3 * 0.000714, 9);
  });
});
