import { describe, expect, it } from "vitest";
import { partsById } from "@echidna/library";

import { buildViolations } from "./buildChecks";

const build = (gpu: string) => ({
  components: [
    { id: "MB1", specId: "b760-atx" },
    { id: "CPU1", specId: "core-i5-12400" },
    { id: "FAN1", specId: "tower-cooler-single" },
    { id: "GPU1", specId: gpu },
    { id: "PSU1", specId: "psu-550w" },
  ],
  slots: {
    CPU1: { hostId: "MB1", slotId: "cpu", wireIds: [] },
    FAN1: { hostId: "MB1", slotId: "cooler", wireIds: [] },
    GPU1: { hostId: "MB1", slotId: "pcie-x16", wireIds: [] },
    PSU1: { hostId: "MB1", slotId: "power", wireIds: [] },
  },
});

describe("buildViolations", () => {
  it("puts power checks on the PSU and the cooling check on the cooler", () => {
    const byRule = Object.fromEntries(
      buildViolations(build("rtx-4060"), partsById).map((v) => [v.ruleId, v]),
    );
    // 50 W board + 117 W CPU + 2 W cooler + 115 W card.
    expect(byRule.psuBudget).toMatchObject({
      componentId: "PSU1",
      actual: 284,
      limit: 550,
      unit: "W",
      severity: "pass",
    });
    expect(byRule.powerConnectors).toMatchObject({ componentId: "PSU1", severity: "pass" });
    expect(byRule.cooling).toMatchObject({ componentId: "FAN1", actual: 117, limit: 150 });
  });

  it("reports the worst connector once, as a fail", () => {
    const connectors = buildViolations(build("rtx-4090"), partsById).filter(
      (v) => v.ruleId === "powerConnectors",
    );
    expect(connectors).toEqual([
      expect.objectContaining({ severity: "fail", actual: 1, limit: 0, unit: "1" }),
    ]);
  });

  it("has nothing to say about a project with no motherboard", () => {
    expect(
      buildViolations({ components: [{ id: "R1", specId: "resistor" }], slots: {} }, partsById),
    ).toEqual([]);
  });
});
