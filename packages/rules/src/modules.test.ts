import { builds, partsById } from "@echidna/library";
import type { ComponentSpec } from "@echidna/core";
import { describe, expect, it } from "vitest";

import { checkBuild, checkModuleFit } from "./modules";

const part = (id: string): ComponentSpec => {
  const spec = partsById.get(id);
  if (!spec) throw new Error(`no part ${id}`);
  return spec;
};

/** A reference build's motherboard and modules, leaving out the one in `without`. */
const build = (id: string, without?: string) => {
  const preset = builds.find((b) => b.id === id);
  if (!preset) throw new Error(`no build ${id}`);
  const modules = Object.entries(preset.modules).flatMap(([slot, spec]) => (slot === without ? [] : [part(spec)]));
  return { host: part(preset.hostId), modules };
};

const fit = (buildId: string, slot: string, specId: string) => {
  const { host, modules } = build(buildId, slot);
  const result = checkModuleFit(host, slot, part(specId), modules);
  return { ...result, by: Object.fromEntries(result.checks.map((c) => [c.id, c])) };
};

describe("reference builds", () => {
  it.each(builds.map((b) => b.id))("%s passes every check, and every part in it fits its slot", (id) => {
    const { host, modules } = build(id);
    expect(checkBuild(host, modules).filter((c) => c.severity !== "pass")).toEqual([]);
    for (const slot of Object.keys(builds.find((b) => b.id === id)?.modules ?? {})) {
      const preset = builds.find((b) => b.id === id);
      expect(fit(id, slot, preset?.modules[slot] ?? "").fits).toBe(true);
    }
  });
});

describe("checkModuleFit", () => {
  it("fails a graphics card beyond the PSU's output, with the numbers", () => {
    const result = fit("desktop-budget", "pcie-x16", "rtx-4090");
    expect(result.fits).toBe(false);
    // 50 W board + 117 W CPU + 2 W cooler + 8 W memory + 7 W SSD + 450 W card, on a 550 W PSU.
    expect(result.by.psuBudget).toMatchObject({ severity: "fail", actual: 634, limit: 550, unit: "W" });
    expect(result.by.powerConnectors).toMatchObject({ severity: "fail", connector: "12v-2x6", actual: 1, limit: 0 });
  });

  it("warns when a card fits but leaves little headroom", () => {
    const result = fit("desktop-gaming", "pcie-x16", "rtx-4090");
    expect(result.fits).toBe(true);
    expect(result.by.psuBudget).toMatchObject({ severity: "warn", actual: 681, limit: 750 });
  });

  it("checks a PSU against the whole build, connectors included", () => {
    const result = fit("desktop-workstation", "power", "psu-750w");
    expect(result.fits).toBe(false);
    expect(result.by.psuBudget).toMatchObject({ severity: "fail", actual: 765, limit: 750 });
    expect(result.by.powerConnectors?.severity).toBe("pass");
    expect(fit("desktop-workstation", "power", "psu-550w").by.powerConnectors).toMatchObject({
      severity: "fail",
      connector: "eps-8pin",
      actual: 2,
      limit: 1,
    });
  });

  it("checks a CPU against the cooler, and a cooler against the CPU", () => {
    expect(fit("desktop-budget", "cpu", "core-i7-14700k").by.cooling).toMatchObject({ severity: "fail", actual: 253, limit: 150 });
    expect(fit("desktop-workstation", "cooler", "tower-cooler-single").by.cooling?.severity).toBe("fail");
    expect(fit("desktop-workstation", "cooler", "tower-cooler-dual").by.cooling?.severity).toBe("warn");
  });

  it("refuses the wrong socket or memory type, and says what the slot takes", () => {
    expect(fit("desktop-budget", "cpu", "ryzen-5-7600").by.interface).toMatchObject({
      severity: "fail",
      protocols: ["am5"],
      accepts: ["lga1700"],
    });
    expect(fit("desktop-gaming", "memory", "ddr4-32gb-kit").fits).toBe(false);
  });

  it("flags checks that rest on estimated figures", () => {
    expect(fit("desktop-gaming", "pcie-x16", "rtx-4090").by.psuBudget?.estimated).toBe(true);
  });

  it("skips the PSU checks until there is a PSU", () => {
    const result = checkModuleFit(part("b650-atx"), "pcie-x16", part("rtx-4090"), []);
    expect(result.fits).toBe(true);
    expect(result.checks.map((c) => c.id)).toEqual(["interface"]);
  });
});
