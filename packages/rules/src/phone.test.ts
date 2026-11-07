import { BATTERY_LIFE_TOLERANCE, builds, partsById } from "@echidna/library";
import type { ComponentSpec, SpecValue } from "@echidna/core";
import { describe, expect, it } from "vitest";

import { batteryRuntime, checkBuild, checkModuleFit, interfaceKey } from "./modules";
import { checkPhone } from "./phone";

const part = (id: string): ComponentSpec => {
  const spec = partsById.get(id);
  if (!spec) throw new Error(`no part ${id}`);
  return spec;
};

/** A preset's host and modules, with any slot swapped for another part. */
const device = (id: string, swaps: Record<string, string> = {}) => {
  const preset = builds.find((b) => b.id === id);
  if (!preset) throw new Error(`no build ${id}`);
  const modules = Object.values({ ...preset.modules, ...swaps }).map(part);
  return { preset, host: part(preset.hostId), modules };
};

const fit = (buildId: string, slot: string, specId: string) => {
  const preset = builds.find((b) => b.id === buildId);
  if (!preset) throw new Error(`no build ${buildId}`);
  const others = Object.entries(preset.modules).flatMap(([s, spec]) =>
    s === slot ? [] : [part(spec)],
  );
  return checkModuleFit(part(preset.hostId), slot, part(specId), others);
};

const handheld = builds.filter((b) => b.deviceType === "smartphone" || b.deviceType === "wearable");

/** Every spec value a part carries in its module, PMIC rails included. */
const valuesOf = (spec: ComponentSpec): SpecValue[] =>
  Object.values(spec.module ?? {}).flatMap((value) => {
    if (Array.isArray(value)) return value.flatMap((rail) => [rail.voltage, rail.maxCurrent]);
    return typeof value === "object" && "source" in value ? [value] : [];
  });

describe("phone and wearable presets", () => {
  it("covers iPhones 13 to 18 Pro Max, Galaxy S21 to S26, a smartwatch and a fitness band", () => {
    expect(handheld.map((b) => b.id)).toEqual([
      "phone-iphone-13",
      "phone-iphone-14",
      "phone-iphone-15",
      "phone-iphone-16",
      "phone-iphone-17",
      "phone-iphone-18-pro",
      "phone-iphone-18-pro-max",
      "phone-galaxy-s21",
      "phone-galaxy-s22",
      "phone-galaxy-s23",
      "phone-galaxy-s24",
      "phone-galaxy-s25",
      "phone-galaxy-s26",
      "wearable-smartwatch",
      "wearable-fitness-band",
    ]);
  });

  it.each(handheld.map((b) => b.id))(
    "%s fits together, with every PMIC rail in budget and a value for every slot",
    (id) => {
      const { preset, host, modules } = device(id);
      expect(Object.keys(preset.modules).sort()).toEqual(
        (host.host?.slots ?? []).map((s) => s.id).sort(),
      );
      for (const [slot, specId] of Object.entries(preset.modules))
        expect(fit(id, slot, specId).fits, `${specId} in ${slot}`).toBe(true);
      const checks = checkBuild(host, modules);
      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every((c) => c.id === "pmicRail" && c.severity === "pass")).toBe(true);
    },
  );

  it.each(handheld.map((b) => b.id))("%s gives every value a source", (id) => {
    const { host, modules } = device(id);
    for (const spec of [host, ...modules]) {
      const values = valuesOf(spec);
      expect(values.length, spec.id).toBeGreaterThan(0);
      for (const value of values) {
        expect(["datasheet", "teardown", "estimated"]).toContain(value.source);
        expect(value.reference, `${spec.id} ${value.value}`).toBeTruthy();
      }
    }
  });

  const published = builds.filter((b) => b.batteryLife);
  it.each(published.map((b) => b.id))(
    "%s plays video for about its published battery life",
    (id) => {
      const { preset, host, modules } = device(id);
      const runtime = batteryRuntime(host, modules);
      const life = preset.batteryLife?.value ?? 0;
      expect(runtime?.estimated).toBe(true);
      expect(Math.abs((runtime?.runtime ?? 0) / life - 1)).toBeLessThanOrEqual(
        BATTERY_LIFE_TOLERANCE,
      );
    },
  );

  it("runs a smartwatch for about a day and a fitness band for over a week", () => {
    const watch = device("wearable-smartwatch");
    const band = device("wearable-fitness-band");
    const days = (spec: ReturnType<typeof device>) =>
      (batteryRuntime(spec.host, spec.modules)?.runtime ?? 0) / 86_400;
    expect(days(watch)).toBeGreaterThan(0.75);
    expect(days(watch)).toBeLessThan(2);
    expect(days(band)).toBeGreaterThan(7);
  });
});

describe("PMIC rail budgets", () => {
  it("adds up what each part draws from its rail at peak", () => {
    const { host, modules } = device("phone-iphone-15");
    const core = checkPhone(host, modules).find((c) => c.railId === "core");
    // The A16's 10 W at 0.8 V.
    expect(core).toMatchObject({ severity: "pass", unit: "A", limit: 17.5, estimated: true });
    expect(core?.actual).toBeCloseTo(12.5, 6);
  });

  it("leaves out every rail until a PMIC is plugged in", () => {
    const { host, modules } = device("phone-galaxy-s24");
    expect(
      checkPhone(
        host,
        modules.filter((m) => m.module?.role !== "pmic"),
      ),
    ).toEqual([]);
  });

  it("fails a smartwatch's display on a fitness band's display rail", () => {
    const result = fit("wearable-fitness-band", "display", "watch-display");
    expect(result.fits).toBe(false);
    expect(result.checks.map((c) => c.id)).toEqual(["interface", "pmicRail"]);
    expect(result.checks[1]).toMatchObject({
      severity: "fail",
      railId: "display",
      estimated: true,
      limit: 0.035,
    });
  });

  it("checks a swapped PMIC against every rail, and a part against only its own", () => {
    const pmic = fit("wearable-smartwatch", "pmic", "band-pmic");
    expect(pmic.fits).toBe(false);
    expect(pmic.checks.filter((c) => c.id === "pmicRail").map((c) => c.railId)).toEqual([
      "core",
      "display",
      "io",
      "sys",
    ]);
    const radio = fit("wearable-fitness-band", "radio", "wifi-bluetooth-radio");
    expect(radio.checks.filter((c) => c.id === "pmicRail").map((c) => c.railId)).toEqual(["sys"]);
    expect(fit("wearable-smartwatch", "display", "band-display").fits).toBe(true);
  });
});

describe("device-specific connectors", () => {
  it("takes a part made for the phone, and refuses one made for another", () => {
    expect(fit("phone-iphone-14", "soc", "apple-a15").fits).toBe(true);
    const wrong = fit("phone-iphone-15", "display", "iphone-14-display");
    expect(wrong.fits).toBe(false);
    expect(wrong.checks[0]).toMatchObject({
      id: "interface",
      protocols: ["mipi-dsi@iphone-14"],
      accepts: ["mipi-dsi@iphone-15"],
    });
  });

  it("lets a coil with no connector fit any phone of the kind it is made for", () => {
    expect(fit("phone-iphone-13", "coil", "magsafe-coil-25w").fits).toBe(true);
    expect(fit("phone-galaxy-s21", "coil", "magsafe-coil-15w").fits).toBe(false);
  });

  it("names an interface by protocol and, when it has one, connector", () => {
    expect(interfaceKey({ protocol: "i2c" })).toBe("i2c");
    expect(interfaceKey({ protocol: "mipi-dsi", connector: "galaxy-s26" })).toBe(
      "mipi-dsi@galaxy-s26",
    );
  });
});
