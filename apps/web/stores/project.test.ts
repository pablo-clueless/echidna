import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHASSIS } from "@/lib/project/foundation";
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

describe("desktop reference builds", () => {
  beforeEach(() => {
    store().loadBuild("desktop-budget");
  });

  it("plugs every module into the motherboard, with no wires", () => {
    const placed = Object.values(store().slots)
      .map((at) => at.slotId)
      .sort();
    expect(placed).toEqual(["cooler", "cpu", "m2", "memory", "pcie-x16", "power"]);
    expect(store().wires).toEqual([]);
    expect(
      Object.values(store().slots).every((at) => at.hostId === "MB1" && at.railId === undefined),
    ).toBe(true);
  });

  it("swaps a graphics card that fits, and leaves one beyond the PSU unplugged", () => {
    const gpu = Object.entries(store().slots).find(([, at]) => at.slotId === "pcie-x16")?.[0] ?? "";
    store().swapInSlots(gpu, "rx-7800-xt");
    expect(store().slots[gpu]).toMatchObject({ slotId: "pcie-x16" });
    store().swapInSlots(gpu, "rtx-4090");
    expect(store().slots[gpu]).toBeUndefined();
  });
});

describe("the project's foundation", () => {
  beforeEach(() => {
    store().clear();
  });

  it("starts on a PCB and keeps circuit parts on it", () => {
    expect(store().addComponent("resistor", { x: 0, y: 0 })).toBe("R1");
    expect(store().foundation).toBe("pcb");
  });

  it("puts each reference build in its own chassis, at the chassis's fixed size", () => {
    store().loadBuild("laptop-ultrabook");
    expect(store().foundation).toBe("laptop");
    expect(store().boardSize).toEqual({ width: CHASSIS.laptop.width, depth: CHASSIS.laptop.depth });
    store().loadBuild("desktop-gaming");
    expect(store().foundation).toBe("desktop");
    store().resizeBoard({ width: 60, depth: 40 });
    expect(store().boardSize).toEqual({
      width: CHASSIS.desktop.width,
      depth: CHASSIS.desktop.depth,
    });
  });

  it("refuses a laptop board on a circuit, and a resistor in a laptop", () => {
    store().addComponent("resistor", { x: 0, y: 0 });
    expect(store().addComponent("ultrabook-board", { x: 8, y: 0 })).toBeNull();
    store().loadBuild("laptop-ultrabook");
    expect(store().addComponent("resistor", { x: 0, y: 0 })).toBeNull();
    expect(store().components.some((c) => c.specId === "resistor")).toBe(false);
  });

  it("lets the first part into an empty project choose its foundation", () => {
    store().addComponent("gaming-laptop-board", { x: 8, y: 0 });
    expect(store().foundation).toBe("laptop");
    store().clear();
    expect(store().foundation).toBe("pcb");
  });

  it("refuses to swap a part for one that does not belong on the foundation", () => {
    store().loadBuild("laptop-gaming");
    store().swapSpec("MB1", "b650-atx");
    expect(store().components.find((c) => c.id === "MB1")?.specId).toBe("gaming-laptop-board");
  });

  it("moves an older laptop build off the PCB it was saved on", () => {
    const migrate = useProjectStore.persist.getOptions().migrate;
    const saved = {
      name: "",
      components: [
        { id: "MB1", specId: "ultrabook-board" },
        { id: "BAT1", specId: "battery-3s-54wh" },
      ],
      wires: [],
      schematic: {},
      board: {
        MB1: { x: -0.01, z: 0.02, rotation: 0 },
        BAT1: { x: 0.03, z: -0.02, rotation: 0 },
      },
      boardSize: { width: 120, depth: 80 },
      ambientTemperature: 298.15,
      slots: { BAT1: { hostId: "MB1", slotId: "battery", wireIds: [] } },
    };
    const { mount } = CHASSIS.laptop;
    expect(migrate?.(saved, 5)).toMatchObject({
      foundation: "laptop",
      boardSize: { width: CHASSIS.laptop.width, depth: CHASSIS.laptop.depth },
      board: {
        MB1: { x: mount.x / 1000, z: mount.z / 1000 },
        BAT1: { x: mount.x / 1000, z: (mount.z + 115) / 1000 },
      },
    });
  });
});

describe("seating modules in their slots", () => {
  beforeEach(() => {
    store().loadBuild("desktop-budget");
  });

  const placementOf = (slotId: string) => {
    const part = Object.entries(store().slots).find(([, at]) => at.slotId === slotId)?.[0] ?? "";
    return store().board[part];
  };

  it("screws the motherboard to its mount and seats each module in its slot", () => {
    const { mount } = CHASSIS.desktop;
    expect(store().board.MB1).toMatchObject({ x: mount.x / 1000, z: mount.z / 1000 });
    const gpu = placementOf("pcie-x16");
    expect(gpu?.x).toBeCloseTo((mount.x - 25) / 1000, 9);
    expect(gpu?.z).toBeCloseTo((mount.z + 45) / 1000, 9);
    expect(placementOf("memory")?.rotation).toBe(90);
  });

  it("moves seated modules with the motherboard", () => {
    const before = placementOf("cpu");
    store().placeOnBoard("MB1", (store().board.MB1?.x ?? 0) + 0.01, store().board.MB1?.z ?? 0);
    expect(placementOf("cpu")?.x).toBeCloseTo((before?.x ?? 0) + 0.01, 9);
    expect(placementOf("cpu")?.z).toBeCloseTo(before?.z ?? 0, 9);
  });

  it("keeps a module where it was once unplugged, and leaves it behind when the board moves", () => {
    const gpu = Object.entries(store().slots).find(([, at]) => at.slotId === "pcie-x16")?.[0] ?? "";
    const seated = store().board[gpu];
    store().unplug(gpu);
    store().placeOnBoard("MB1", (store().board.MB1?.x ?? 0) + 0.02, store().board.MB1?.z ?? 0);
    expect(store().board[gpu]).toEqual(seated);
  });
});
