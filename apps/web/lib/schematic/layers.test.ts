import { beforeEach, describe, expect, it, vi } from "vitest";
import { builds, partsById } from "@echidna/library";

import { hostLayers, placedBounds } from "./layers";
import { useProjectStore } from "@/stores/project";

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

const spec = (id: string) => {
  const found = partsById.get(id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
};

/** The schematic placement of whatever is in a slot. */
const inSlot = (slotId: string) => {
  const id = Object.entries(store().slots).find(([, at]) => at.slotId === slotId)?.[0] ?? "";
  const at = store().schematic[id];
  if (!at) throw new Error(`nothing in ${slotId}`);
  return at;
};

describe("host layers", () => {
  it("stacks a cooler above its CPU, and lays the rest across the board in order", () => {
    const { cells, bands } = hostLayers(spec("b760-atx"), [
      { id: "U1", slotId: "cpu" },
      { id: "HS1", slotId: "cooler" },
      { id: "G1", slotId: "pcie-x16" },
      { id: "PSU1", slotId: "power" },
    ]);
    const cell = (id: string) => cells.find((c) => c.id === id);
    expect(cell("HS1")).toMatchObject({ column: cell("U1")?.column, row: 1 });
    expect(cell("U1")?.row).toBe(0);
    // The PSU's seat is furthest left, then the graphics card's, then the CPU's.
    expect([cell("PSU1"), cell("G1"), cell("U1")].map((c) => c?.column)).toEqual([0, 1, 2]);
    expect(bands.map((b) => b.label)).toEqual([{ key: "onBoard" }, { key: "stacked", layer: 2 }]);
  });

  it("puts a phone's upper board above its main board, and flex-joined parts in their own group", () => {
    const { cells, bands } = hostLayers(spec("iphone-17-board"), [
      { id: "U1", slotId: "soc" },
      { id: "MDM1", slotId: "modem" },
      { id: "BAT1", slotId: "battery" },
      { id: "L1", slotId: "coil" },
    ]);
    const cell = (id: string) => cells.find((c) => c.id === id);
    expect(cell("MDM1")).toMatchObject({ group: "board", row: 0 });
    expect(cell("U1")).toMatchObject({ group: "board", row: 1 });
    // The coil sits over the battery.
    expect(cell("BAT1")).toMatchObject({ group: "flex", row: 0 });
    expect(cell("L1")).toMatchObject({ group: "flex", row: 1, column: cell("BAT1")?.column });
    expect(bands.map((b) => b.label)).toEqual(
      expect.arrayContaining([
        { key: "board", board: "main" },
        { key: "board", board: "upper" },
        { key: "flex" },
      ]),
    );
  });

  it("keeps a dev board's header parts in slot order", () => {
    const { cells } = hostLayers(spec("esp32-devkitc"), [
      { id: "S2", slotId: "gpio" },
      { id: "S1", slotId: "i2c" },
    ]);
    expect(cells).toEqual([
      { id: "S1", group: "header", column: 0, row: 0 },
      { id: "S2", group: "header", column: 1, row: 0 },
    ]);
  });
});

describe("layered schematic", () => {
  beforeEach(() => store().clear());

  it.each(builds.map((b) => b.id))("draws %s with no box over another", (buildId) => {
    store().loadBuild(buildId);
    const boxes = store().components.map((c) => {
      const at = store().schematic[c.id];
      const b = placedBounds(spec(c.specId), at?.rotation ?? 0);
      return { id: c.id, x: at?.x ?? 0, y: at?.y ?? 0, ...b };
    });
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= a.w + b.w || Math.abs(a.y - b.y) >= a.h + b.h;
        expect(apart, `${a.id} and ${b.id}`).toBe(true);
      }
  });

  it("draws the cooler above the CPU in the gaming desktop", () => {
    store().loadBuild("desktop-gaming");
    expect(inSlot("cooler").x).toBe(inSlot("cpu").x);
    expect(inSlot("cooler").y).toBeLessThan(inSlot("cpu").y);
  });

  it("lays a part out in its layer when it is plugged in, wherever it was dropped", () => {
    store().loadPreset("esp32-devkitc");
    const id = store().addComponent("bme280", { x: 80, y: -40 });
    if (!id) throw new Error("no BME280");
    store().plugIn(id, "B1", "i2c");
    const host = store().schematic.B1;
    const at = store().schematic[id];
    expect(at?.x).toBeGreaterThan(host?.x ?? 0);
    expect(at?.x).toBeLessThan(40);
  });

  it("tidies parts moved out of their layers back into them", () => {
    store().loadBuild("desktop-budget");
    const before = structuredClone(store().schematic);
    for (const c of store().components) store().moveComponent(c.id, { x: 99, y: 99 });
    store().moveComponent("MB1", before.MB1 ?? { x: 0, y: 0 });
    store().arrangeSchematic();
    expect(store().schematic).toEqual(before);
  });
});
