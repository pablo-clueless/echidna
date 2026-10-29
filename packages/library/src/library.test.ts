import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Netlist } from "@echidna/core";
import Ajv2020 from "ajv/dist/2020.js";

import { GROUND_NODE, requiredParams, toCircuit } from "./circuit";
import { parts, partsById } from "./parts";

const partsDir = new URL("../parts/", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("../schema/component.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

describe("part data", () => {
  const files = readdirSync(partsDir).filter((f) => f.endsWith(".json"));

  it.each(files)("%s matches the schema", (file) => {
    const data = JSON.parse(readFileSync(new URL(file, partsDir), "utf8"));
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(`${data.id}.json`).toBe(file);
  });

  it("bundles every part file", () => {
    expect(parts.map((p) => `${p.id}.json`).sort()).toEqual(files.sort());
  });

  it.each(parts)("$id has the parameters its model needs and valid rating pins", (part) => {
    for (const key of requiredParams[part.model] ?? ["unknown model"]) expect(part.params).toHaveProperty(key);
    const pinIds = part.pins.map((p) => p.id);
    for (const pins of Object.values(part.ratingPins ?? {})) {
      for (const pin of pins) expect(pinIds).toContain(pin);
    }
  });
});

describe("toCircuit", () => {
  const netlist: Netlist = {
    groundNetId: "gnd",
    components: [
      { id: "V1", specId: "dc-supply" },
      { id: "R1", specId: "resistor", paramOverrides: { resistance: 68 } },
      { id: "D1", specId: "led-red-5mm" },
      { id: "G1", specId: "ground" },
      { id: "G2", specId: "ground" },
    ],
    nets: [
      { id: "vcc", pins: [{ componentId: "V1", pinId: "pos" }, { componentId: "R1", pinId: "1" }] },
      { id: "a", pins: [{ componentId: "R1", pinId: "2" }, { componentId: "D1", pinId: "a" }] },
      { id: "gnd", pins: [{ componentId: "V1", pinId: "neg" }, { componentId: "G1", pinId: "gnd" }] },
      { id: "k", pins: [{ componentId: "D1", pinId: "k" }, { componentId: "G2", pinId: "gnd" }] },
    ],
  };

  it("maps nets to nodes, merging every ground symbol into the reference", () => {
    const { circuit, netNodes } = toCircuit(netlist, partsById);
    expect(netNodes.gnd).toBe(GROUND_NODE);
    expect(netNodes.k).toBe(GROUND_NODE);
    expect(circuit.elements.map((e) => e.id)).toEqual(["V1", "R1", "D1"]);
    expect(circuit.elements.find((e) => e.id === "D1")?.nodes).toEqual(["n:a", GROUND_NODE]);
  });

  it("applies parameter overrides over spec values", () => {
    const r1 = toCircuit(netlist, partsById).circuit.elements.find((e) => e.id === "R1");
    expect(r1).toMatchObject({ kind: "resistor", resistance: 68 });
  });

  it("gives unconnected pins their own node", () => {
    const { circuit } = toCircuit({ ...netlist, nets: netlist.nets.slice(0, 1) }, partsById);
    expect(circuit.elements.find((e) => e.id === "D1")?.nodes).toEqual(["p:D1/a", "p:D1/k"]);
  });

  it("skips components with unknown specs", () => {
    const { circuit } = toCircuit(
      { ...netlist, components: [...netlist.components, { id: "X1", specId: "missing" }] },
      partsById,
    );
    expect(circuit.elements.some((e) => e.id === "X1")).toBe(false);
  });
});
