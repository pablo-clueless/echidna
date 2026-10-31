import { partsById, toCircuit } from "@echidna/library";
import { describe, expect, it } from "vitest";

import {
  deriveNets,
  nextDesignator,
  releaseMomentary,
  switchClosed,
  switchPositions,
  toNetlist,
  type Wire,
} from "./model";
import { pinPositions, routeWire } from "../schematic/symbols";
import { regulatorExample } from "./example";

const pin = (componentId: string, pinId: string) => ({ componentId, pinId });

describe("nextDesignator", () => {
  it("fills the first free number per prefix", () => {
    expect(nextDesignator("resistor", [])).toBe("R1");
    expect(nextDesignator("resistor", ["R1", "R3"])).toBe("R2");
    expect(nextDesignator("led", ["R1"])).toBe("D1");
    expect(nextDesignator("mystery", [])).toBe("X1");
  });
});

describe("deriveNets", () => {
  it("merges chains of wires into one net", () => {
    const wires: Wire[] = [
      { id: "W1", a: pin("R1", "1"), b: pin("R2", "1") },
      { id: "W2", a: pin("R2", "1"), b: pin("R3", "2") },
      { id: "W3", a: pin("R4", "1"), b: pin("R4", "2") },
    ];
    const nets = deriveNets(wires);
    expect(nets).toHaveLength(2);
    expect(nets.find((n) => n.pins.length === 3)?.id).toBe("net:R1/1");
  });

  it("keeps net IDs stable when unrelated wires change", () => {
    const base: Wire[] = [{ id: "W1", a: pin("R1", "1"), b: pin("R2", "1") }];
    const before = deriveNets(base)[0]?.id;
    const after = deriveNets([...base, { id: "W2", a: pin("C1", "1"), b: pin("C2", "1") }]).find((n) =>
      n.pins.some((p) => p.componentId === "R1"),
    )?.id;
    expect(after).toBe(before);
  });
});

describe("regulator example", () => {
  const example = regulatorExample();

  it("wires every pin of every part", () => {
    const netlist = toNetlist(example);
    const { circuit } = toCircuit(netlist, partsById);
    for (const element of circuit.elements) {
      for (const node of element.nodes) expect(node.startsWith("p:")).toBe(false);
    }
  });

  it("has schematic wires that run along the grid between pins", () => {
    const at = (id: string, pinId: string) => {
      const component = example.components.find((c) => c.id === id);
      const spec = partsById.get(component?.specId ?? "");
      const placement = example.schematic[id];
      if (!spec || !placement) throw new Error(id);
      return pinPositions(spec.kind, placement)[spec.pins.findIndex((p) => p.id === pinId)];
    };
    for (const w of example.wires) {
      const a = at(w.a.componentId, w.a.pinId);
      const b = at(w.b.componentId, w.b.pinId);
      expect(a && b && routeWire(a, b).length).toBeGreaterThan(1);
      for (const p of [a, b]) expect(Number.isInteger(p?.x) && Number.isInteger(p?.y)).toBe(true);
    }
  });
});

describe("switches", () => {
  const slide = partsById.get("switch-spst");
  const push = partsById.get("switch-push");
  if (!slide || !push) throw new Error("missing part");

  it("reads a switch's position from its closed parameter, defaulting to the first variant", () => {
    expect(switchClosed(slide)).toBe(true);
    expect(switchClosed(slide, "open")).toBe(false);
    expect(switchClosed(push)).toBe(false);
    expect(switchClosed(push, "closed")).toBe(true);
  });

  it("finds the closed and open positions whatever order they are listed in", () => {
    expect(switchPositions(slide)).toEqual({ closed: "closed", open: "open" });
    expect(switchPositions(push)).toEqual({ closed: "closed", open: "open" });
    expect(switchPositions(partsById.get("resistor") ?? slide)).toBeUndefined();
  });

  it("lets go of push buttons but leaves latching switches where they were set", () => {
    const components = [
      { id: "SW1", specId: "switch-spst", variant: "open" },
      { id: "SW2", specId: "switch-push", variant: "closed" },
      { id: "SW3", specId: "switch-push" },
    ];
    const released = releaseMomentary(components, partsById);
    expect(released).toEqual([components[0], { id: "SW2", specId: "switch-push" }, components[2]]);
    expect(released[0]).toBe(components[0]);
    expect(toCircuit(toNetlist({ components: released, wires: [] }), partsById).circuit.elements[1]).toMatchObject({
      closed: 0,
    });
  });
});
