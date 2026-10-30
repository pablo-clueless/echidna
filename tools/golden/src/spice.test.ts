import { describe, expect, it } from "vitest";

import { parsePrintAll, toSpice } from "./spice";
import { goldenDc } from "./circuits";

describe("toSpice", () => {
  it("renames nodes to SPICE-safe names with ground as 0", () => {
    const deck = toSpice(
      {
        ground: "gnd",
        elements: [
          { id: "V1", kind: "voltageSource", nodes: ["n:net:V1/pos", "gnd"], voltage: 5 },
          { id: "R1", kind: "resistor", nodes: ["n:net:V1/pos", "gnd"], resistance: 1000 },
        ],
      },
      "test",
    );
    expect([...deck.nodes]).toEqual([
      ["gnd", "0"],
      ["n:net:V1/pos", "n1"],
    ]);
    expect(deck.netlist).toContain("V0 n1 0 DC 5.000000000000e+0");
    expect(deck.netlist).toContain("R1 n1 0 1.000000000000e+3");
    expect(deck.sourceCurrents.get("V1")).toBe("v0#branch");
  });

  it("models the regulator as a clamped source drawing its output current from the input", () => {
    const regulator = goldenDc.find((g) => g.name.includes("dropout"));
    const deck = toSpice(regulator?.circuit ?? { ground: "0", elements: [] }, "regulator");
    expect(deck.netlist).toMatch(/^B1 x1 0 V = min\(v\(0\) \+ 3\.3\S*, v\(n1\) - 1\.1\S*\)$/m);
    expect(deck.netlist).toMatch(/^Vsense1 x1 n2 DC 0$/m);
    expect(deck.netlist).toMatch(/^F1 n1 0 Vsense1 1$/m);
    expect(deck.netlist).toMatch(/^Iq1 n1 0 DC 5\.0+e-3$/m);
  });

  it("gives every golden circuit a deck that ends the control block", () => {
    for (const { name, circuit } of goldenDc) {
      expect(toSpice(circuit, name).netlist).toMatch(/\.control\nop\nprint all\n\.endc\n\.end\n$/);
    }
  });
});

describe("parsePrintAll", () => {
  it("reads both v(node) and bare vector names, ignoring other output", () => {
    const output = [
      "Note: No compatibility mode selected!",
      "Circuit: * voltage divider",
      "",
      "Doing analysis at TEMP = 27.000000 and TNOM = 27.000000",
      "v(n1) = 1.200000e+01",
      "n2 = 3.826087e+00",
      "v0#branch = -1.73913e-03",
    ].join("\n");
    expect([...parsePrintAll(output)]).toEqual([
      ["n1", 12],
      ["n2", 3.826087],
      ["v0#branch", -1.73913e-3],
    ]);
  });
});
