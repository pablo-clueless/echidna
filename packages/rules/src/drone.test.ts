import { builds, FLIGHT_TIME_TOLERANCE, partsById } from "@echidna/library";
import type { ComponentSpec } from "@echidna/core";
import { describe, expect, it } from "vitest";

import { checkBuild, checkModuleFit } from "./modules";
import { checkDrone, flightTime } from "./drone";

const part = (id: string): ComponentSpec => {
  const spec = partsById.get(id);
  if (!spec) throw new Error(`no part ${id}`);
  return spec;
};

/** A preset's frame and modules, with any slot swapped for another part. */
const drone = (id: string, swaps: Record<string, string> = {}) => {
  const preset = builds.find((b) => b.id === id);
  if (!preset) throw new Error(`no build ${id}`);
  const modules = Object.entries({ ...preset.modules, ...swaps }).map(([, spec]) => part(spec));
  return { preset, frame: part(preset.hostId), modules };
};

const byId = (checks: ReturnType<typeof checkDrone>) =>
  Object.fromEntries(checks.map((c) => [c.id, c]));

const fit = (buildId: string, slot: string, specId: string) => {
  const preset = builds.find((b) => b.id === buildId);
  if (!preset) throw new Error(`no build ${buildId}`);
  const others = Object.entries(preset.modules).flatMap(([s, spec]) =>
    s === slot ? [] : [part(spec)],
  );
  const result = checkModuleFit(part(preset.hostId), slot, part(specId), others);
  return { ...result, by: byId(result.checks) };
};

const minutes = (seconds: number) => seconds / 60;

describe("drone presets", () => {
  const djiPresets = builds.filter((b) => b.flightTime);

  it.each(djiPresets.map((b) => b.id))(
    "%s hovers for its published flight time, within the stated tolerance",
    (id) => {
      const { preset, frame, modules } = drone(id);
      const estimate = flightTime(frame, modules);
      const published = preset.flightTime?.value ?? 0;
      expect(estimate).not.toBeNull();
      expect(Math.abs((estimate?.time ?? 0) / published - 1)).toBeLessThanOrEqual(
        FLIGHT_TIME_TOLERANCE,
      );
      expect(estimate?.estimated).toBe(true);
    },
  );

  it("weighs every DJI Mini preset at the published 249 g", () => {
    for (const { id } of djiPresets) {
      expect(flightTime(drone(id).frame, drone(id).modules)?.weight).toBeCloseTo(249, 0);
    }
  });

  // DJI publishes 47 and 45 minutes with the Battery Plus; the model was not tuned to these, so they test it.
  it.each([
    ["drone-dji-mini-3-pro", 47],
    ["drone-dji-mini-4-pro", 45],
  ])("%s with the Battery Plus hovers for about its published %i minutes", (id, published) => {
    const { frame, modules } = drone(id, { battery: "dji-mini-3-battery-plus" });
    const estimate = flightTime(frame, modules);
    expect(Math.abs(minutes(estimate?.time ?? 0) / published - 1)).toBeLessThanOrEqual(
      FLIGHT_TIME_TOLERANCE,
    );
  });

  it("gives the FPV quad a short hover on a LiPo and a long one on Li-ion", () => {
    const lipo = flightTime(drone("drone-fpv-5in").frame, drone("drone-fpv-5in").modules);
    const liion = drone("drone-fpv-5in", { battery: "liion-4s-4000" });
    const long = flightTime(liion.frame, liion.modules);
    expect(minutes(lipo?.time ?? 0)).toBeGreaterThan(8);
    expect(minutes(lipo?.time ?? 0)).toBeLessThan(16);
    expect(long?.time ?? 0).toBeGreaterThan((lipo?.time ?? 0) * 1.6);
  });

  it("reports thrust and weight in grams, and the FPV quad's ESC and battery headroom", () => {
    const { frame, modules } = drone("drone-fpv-5in");
    const checks = byId(checkBuild(frame, modules));
    expect(checks.thrustToWeight).toMatchObject({ severity: "pass", unit: "g" });
    expect(checks.thrustToWeight?.limit).toBeCloseTo(4 * 1397, -1);
    expect(checks.escCurrent).toMatchObject({ severity: "pass", actual: 32, limit: 45 });
    expect(checks.batteryDischarge).toMatchObject({ severity: "pass", actual: 128, limit: 180 });
  });
});

describe("drone swaps", () => {
  it("fails an under-rated ESC, with the motor current against its rating", () => {
    const result = fit("drone-fpv-5in", "esc", "esc-4in1-30a");
    expect(result.fits).toBe(false);
    expect(result.by.escCurrent).toMatchObject({ severity: "fail", actual: 32, limit: 30 });
    expect(result.by.escCurrent?.estimated).toBe(true);
    expect(Object.keys(result.by)).toEqual(["interface", "escCurrent"]);
  });

  it("warns when hungrier motors leave the ESC and battery little headroom", () => {
    const result = fit("drone-fpv-5in", "motors", "motors-2306-2450kv");
    expect(result.fits).toBe(true);
    expect(result.by.escCurrent).toMatchObject({ severity: "warn", actual: 42, limit: 45 });
    expect(result.by.batteryDischarge).toMatchObject({ severity: "warn", actual: 168 });
  });

  it("fails a Li-ion pack that can't feed the motors at full throttle", () => {
    const result = fit("drone-fpv-5in", "battery", "liion-4s-4000");
    expect(result.by.batteryDischarge).toMatchObject({ severity: "fail", actual: 128, limit: 45 });
  });

  it("refuses parts made for another drone", () => {
    expect(fit("drone-dji-mini-2", "battery", "dji-mini-3-battery").fits).toBe(false);
    expect(fit("drone-dji-mini-4-pro", "battery", "dji-mini-3-battery-plus").fits).toBe(true);
    expect(fit("drone-fpv-5in", "motors", "dji-mini-2-motors").by.interface?.severity).toBe("fail");
  });
});

describe("thrust to weight", () => {
  const frame = part("fpv-frame-5in");
  const heavy = (kg: number): ComponentSpec => ({
    ...part("lipo-4s-1500-120c"),
    module: {
      ...part("lipo-4s-1500-120c").module!,
      mass: { value: kg, unit: "kg", source: "datasheet" },
    },
  });
  const rest = ["motors-2207-1950kv", "props-5in-triblade", "esc-4in1-45a"].map(part);

  it.each([
    [1, "pass"],
    [2.8, "warn"],
    [4.6, "fail"],
  ])("grades a %f kg payload as %s", (kg, severity) => {
    expect(byId(checkDrone(frame, [...rest, heavy(kg)])).thrustToWeight?.severity).toBe(severity);
  });

  it("leaves out checks for parts not yet plugged in, and has no time without a battery", () => {
    expect(checkDrone(frame, [])).toEqual([]);
    expect(flightTime(frame, rest)).toBeNull();
  });
});
