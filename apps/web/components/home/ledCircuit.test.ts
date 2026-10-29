import { describe, expect, it } from "vitest";

import { resistorOptions, solveLedCircuit } from "./ledCircuit";

describe("solveLedCircuit", () => {
  it("applies Ohm's law across the resistor", () => {
    expect(solveLedCircuit(330).current).toBeCloseTo(3 / 330, 12);
  });

  it("passes comfortably with a 330 Ω resistor", () => {
    const { severity, ratio } = solveLedCircuit(330);
    expect(severity).toBe("pass");
    expect(ratio).toBeCloseTo(0.4545, 3);
  });

  it("warns at exactly the rated current", () => {
    expect(solveLedCircuit(150).severity).toBe("warn");
  });

  it("fails above the rating", () => {
    expect(solveLedCircuit(100).severity).toBe("fail");
  });

  it("orders options so current rises along the slider", () => {
    const currents = resistorOptions.map((r) => solveLedCircuit(r).current);
    expect([...currents].sort((a, b) => a - b)).toEqual(currents);
  });
});
