import { beforeEach, describe, expect, it, vi } from "vitest";

import { describeProject, executeTool } from "./execute";
import { useProjectStore } from "@/stores/project";
import { useStudioStore } from "@/stores/studio";

vi.hoisted(() => {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  });
});

const project = () => useProjectStore.getState();

describe("the assistant's tools", () => {
  beforeEach(() => {
    project().clear();
    useStudioStore.getState().setViolations([]);
  });

  it("adds a part and returns its ID", () => {
    const result = executeTool("add_part", { specId: "resistor" });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({ id: "R1", specId: "resistor" });
    expect(project().components).toEqual([{ id: "R1", specId: "resistor" }]);
  });

  it("refuses a part that isn't in the catalogue", () => {
    const result = executeTool("add_part", { specId: "flux-capacitor" });
    expect(result.isError).toBe(true);
    expect(project().components).toEqual([]);
  });

  it("places new parts clear of each other in the schematic", () => {
    executeTool("add_part", { specId: "resistor" });
    executeTool("add_part", { specId: "resistor" });
    expect(project().schematic.R2!.x).toBeGreaterThan(project().schematic.R1!.x);
  });

  it("wires two pins and names a pin that doesn't exist", () => {
    executeTool("add_part", { specId: "resistor" });
    executeTool("add_part", { specId: "led-5mm" });
    const wired = executeTool("connect", {
      a: { componentId: "R1", pinId: "2" },
      b: { componentId: "D1", pinId: "a" },
    });
    expect(wired.isError).toBe(false);
    expect(project().wires).toHaveLength(1);

    const bad = executeTool("connect", {
      a: { componentId: "R1", pinId: "3" },
      b: { componentId: "D1", pinId: "a" },
    });
    expect(bad.isError).toBe(true);
    expect(bad.content).toContain("Its pins are: 1, 2");
  });

  it("sets and resets a parameter, and refuses an unknown one", () => {
    executeTool("add_part", { specId: "resistor" });
    executeTool("set_param", { partId: "R1", param: "resistance", value: 220 });
    expect(project().components[0]!.paramOverrides).toEqual({ resistance: 220 });
    executeTool("set_param", { partId: "R1", param: "resistance", value: null });
    expect(project().components[0]!.paramOverrides).toBeUndefined();
    expect(executeTool("set_param", { partId: "R1", param: "colour", value: 1 }).isError).toBe(
      true,
    );
  });

  it("plugs a sensor into a host board's slot", () => {
    project().loadPreset("raspberry-pi-5");
    const { id } = JSON.parse(executeTool("add_part", { specId: "bme280" }).content) as {
      id: string;
    };
    const result = executeTool("plug_in", { partId: id, hostId: "B1", slotId: "i2c" });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content).pluggedIn).toBe(true);
    expect(project().slots[id]).toMatchObject({ hostId: "B1", slotId: "i2c" });
  });

  it("reads the project with its warn and fail verdicts", () => {
    executeTool("add_part", { specId: "led-5mm" });
    useStudioStore.getState().setViolations([
      {
        componentId: "D1",
        ruleId: "current",
        actual: 0.03,
        limit: 0.02,
        unit: "A",
        severity: "fail",
        estimated: false,
      },
    ]);
    const read = describeProject();
    expect(read.parts).toEqual([{ id: "D1", specId: "led-5mm", name: "LED, 5 mm" }]);
    expect(read.verdicts.issues).toEqual([
      expect.objectContaining({ partId: "D1", severity: "fail", rule: "current" }),
    ]);
  });

  it("answers bad input and unknown tools with an error result, never a throw", () => {
    expect(executeTool("remove_part", { partId: "R9" }).isError).toBe(true);
    expect(executeTool("launch_rocket", {}).isError).toBe(true);
    expect(executeTool("get_project", null).isError).toBe(true);
  });
});
