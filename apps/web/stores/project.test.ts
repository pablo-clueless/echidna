import { beforeEach, describe, expect, it, vi } from "vitest";

import { deriveNets } from "@/lib/project/model";
import { useProjectStore } from "./project";

// The store persists to localStorage, which it looks up as it is created; Node has none to offer.
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

const store = () => useProjectStore.getState();

/** The pins wired to a pin, as `component/pin` keys. */
const wiredTo = (componentId: string, pinId: string) =>
  deriveNets(store().wires)
    .find((n) => n.pins.some((p) => p.componentId === componentId && p.pinId === pinId))
    ?.pins.map((p) => `${p.componentId}/${p.pinId}`)
    .sort() ?? [];

describe("plugging parts into a host board", () => {
  beforeEach(() => {
    store().loadPreset("raspberry-pi-4");
  });

  it("starts a preset with just the host board", () => {
    expect(store().components).toEqual([{ id: "B1", specId: "raspberry-pi-4" }]);
    expect(store().slots).toEqual({});
  });

  it("wires a part that fits to the slot's rail, ground and signals", () => {
    const id = store().addComponent("bme280", { x: 20, y: 6 }) ?? "";
    const fit = store().plugIn(id, "B1", "i2c");
    expect(fit?.fits).toBe(true);
    expect(store().slots[id]).toMatchObject({ hostId: "B1", slotId: "i2c", railId: "3v3" });
    expect(wiredTo(id, "vdd")).toEqual(["B1/3v3", `${id}/vdd`]);
    expect(wiredTo(id, "gnd")).toEqual(["B1/gnd", `${id}/gnd`]);
    expect(wiredTo(id, "sda")).toEqual(["B1/sda", `${id}/sda`]);
    expect(wiredTo(id, "scl")).toEqual(["B1/scl", `${id}/scl`]);
  });

  it("refuses a part that fails a check, says why, and wires nothing", () => {
    const id = store().addComponent("hc-sr04", { x: 20, y: 6 }) ?? "";
    const fit = store().plugIn(id, "B1", "gpio");
    expect(fit?.fits).toBe(false);
    expect(fit?.checks.find((c) => c.severity === "fail")?.id).toBe("logicIntoHost");
    expect(store().slots[id]).toBeUndefined();
    expect(store().wires).toEqual([]);
  });

  it("refuses a slot another part already uses", () => {
    const first = store().addComponent("ds18b20", { x: 20, y: 6 }) ?? "";
    const second = store().addComponent("ds18b20", { x: 20, y: 12 }) ?? "";
    expect(store().plugIn(first, "B1", "gpio")?.fits).toBe(true);
    store().plugIn(second, "B1", "gpio");
    expect(store().slots[second]).toBeUndefined();
  });

  it("moves a part between slots, and unplugging removes only the wires plugging in added", () => {
    const id = store().addComponent("ds18b20", { x: 20, y: 6 }) ?? "";
    store().connect({ componentId: id, pinId: "vdd" }, { componentId: "B1", pinId: "5v" });
    store().plugIn(id, "B1", "gpio");
    const added = store().slots[id]?.wireIds ?? [];
    expect(added.length).toBeGreaterThan(0);
    store().unplug(id);
    expect(store().slots[id]).toBeUndefined();
    expect(store().wires).toHaveLength(1);
  });

  it("unplugs everything when the host is removed, and a part when it is swapped", () => {
    const sensor = store().addComponent("bme280", { x: 20, y: 6 }) ?? "";
    store().plugIn(sensor, "B1", "i2c");
    store().swapSpec(sensor, "ds18b20");
    expect(store().slots[sensor]).toBeUndefined();
    expect(store().wires).toEqual([]);

    store().swapSpec(sensor, "bme280");
    store().plugIn(sensor, "B1", "i2c");
    store().removeComponent("B1");
    expect(store().slots).toEqual({});
    expect(store().wires).toEqual([]);
  });
});

describe("swapping parts in slots", () => {
  beforeEach(() => {
    store().loadPreset("raspberry-pi-4");
  });

  it("keeps a swapped sensor in its slot", () => {
    const id = store().addComponent("ds18b20", { x: 20, y: 6 }) ?? "";
    store().plugIn(id, "B1", "gpio");
    store().swapInSlots(id, "ds18b20");
    expect(store().slots[id]).toMatchObject({ hostId: "B1", slotId: "gpio" });
  });

  it("keeps everything plugged into a swapped host in the same slots", () => {
    const sensor = store().addComponent("bme280", { x: 20, y: 6 }) ?? "";
    store().plugIn(sensor, "B1", "i2c");
    store().swapInSlots("B1", "esp32-devkitc");
    expect(store().components.find((c) => c.id === "B1")?.specId).toBe("esp32-devkitc");
    expect(store().slots[sensor]).toMatchObject({ hostId: "B1", slotId: "i2c", railId: "3v3" });
    expect(wiredTo(sensor, "sda")).toEqual(["B1/sda", `${sensor}/sda`]);
  });

  it("leaves a part unplugged when the new host no longer takes it", () => {
    const sensor = store().addComponent("bme280", { x: 20, y: 6 }) ?? "";
    store().plugIn(sensor, "B1", "i2c");
    store().swapInSlots("B1", "arduino-uno-r4");
    expect(store().slots[sensor]).toBeUndefined();
    expect(store().wires).toEqual([]);
  });
});
