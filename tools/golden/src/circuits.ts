import type { Circuit } from "@echidna/solver/types";

/** Red 5 mm LED model from `packages/library/parts/led-red-5mm.json`. */
const RED_LED = { saturationCurrent: 3.23e-19, emissionCoefficient: 2 } as const;
/** A 1N4148-class signal diode, with series resistance. */
const SIGNAL_DIODE = { saturationCurrent: 2.52e-9, emissionCoefficient: 1.752, seriesResistance: 0.568 } as const;
/** The 3.3 V LDO from `packages/library/parts/ldo-3v3.json`. */
const LDO_3V3 = { outputVoltage: 3.3, dropoutVoltage: 1.1, quiescentCurrent: 0.005 } as const;

/** Phase 1 golden DC circuits. Each must have no floating nodes, so ngspice and our solver both have one answer. */
export const goldenDc: { name: string; circuit: Circuit }[] = [
  {
    name: "voltage divider",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 12 },
        { id: "R1", kind: "resistor", nodes: ["in", "mid"], resistance: 4700 },
        { id: "R2", kind: "resistor", nodes: ["mid", "0"], resistance: 2200 },
      ],
    },
  },
  {
    name: "resistor ladder with two sources",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["a", "0"], voltage: 9 },
        { id: "V2", kind: "voltageSource", nodes: ["d", "0"], voltage: -3.3 },
        { id: "R1", kind: "resistor", nodes: ["a", "b"], resistance: 1000 },
        { id: "R2", kind: "resistor", nodes: ["b", "0"], resistance: 3300 },
        { id: "R3", kind: "resistor", nodes: ["b", "c"], resistance: 470 },
        { id: "R4", kind: "resistor", nodes: ["c", "0"], resistance: 10_000 },
        { id: "R5", kind: "resistor", nodes: ["c", "d"], resistance: 2200 },
      ],
    },
  },
  {
    name: "current source, inductor and capacitor at DC",
    circuit: {
      ground: "0",
      elements: [
        { id: "I1", kind: "currentSource", nodes: ["0", "a"], current: 0.002 },
        { id: "R1", kind: "resistor", nodes: ["a", "0"], resistance: 1500 },
        { id: "L1", kind: "inductor", nodes: ["a", "b"], inductance: 1e-3 },
        { id: "R2", kind: "resistor", nodes: ["b", "0"], resistance: 680 },
        { id: "C1", kind: "capacitor", nodes: ["b", "0"], capacitance: 1e-6 },
      ],
    },
  },
  {
    name: "LED with series resistor",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "a"], resistance: 150 },
        { id: "D1", kind: "diode", nodes: ["a", "0"], ...RED_LED },
      ],
    },
  },
  {
    name: "signal diode with series resistance",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "a"], resistance: 1000 },
        { id: "D1", kind: "diode", nodes: ["a", "0"], ...SIGNAL_DIODE },
      ],
    },
  },
  {
    name: "reverse-biased diode",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 10 },
        { id: "R1", kind: "resistor", nodes: ["in", "k"], resistance: 10_000 },
        { id: "D1", kind: "diode", nodes: ["0", "k"], ...SIGNAL_DIODE },
      ],
    },
  },
  {
    name: "3.3 V regulator driving an LED (Phase 1 acceptance circuit)",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "U1", kind: "linearRegulator", nodes: ["in", "out", "0"], ...LDO_3V3 },
        { id: "C1", kind: "capacitor", nodes: ["out", "0"], capacitance: 10e-6 },
        { id: "R1", kind: "resistor", nodes: ["out", "a"], resistance: 150 },
        { id: "D1", kind: "diode", nodes: ["a", "0"], ...RED_LED },
      ],
    },
  },
  {
    name: "3.3 V regulator in dropout",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 4 },
        { id: "U1", kind: "linearRegulator", nodes: ["in", "out", "0"], ...LDO_3V3 },
        { id: "R1", kind: "resistor", nodes: ["out", "0"], resistance: 100 },
      ],
    },
  },
];
