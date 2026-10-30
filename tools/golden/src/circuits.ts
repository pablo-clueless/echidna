import type { Circuit } from "@echidna/solver/types";

import type { TransientCheck } from "./spice";

/** Red 5 mm LED model from `packages/library/parts/led-5mm.json`. */
const RED_LED = { saturationCurrent: 3.23e-19, emissionCoefficient: 2 } as const;
/** A 1N4148-class signal diode, with series resistance. */
const SIGNAL_DIODE = { saturationCurrent: 2.52e-9, emissionCoefficient: 1.752, seriesResistance: 0.568 } as const;
/** The 3.3 V LDO from `packages/library/parts/ldo-3v3.json`. */
const LDO_3V3 = { outputVoltage: 3.3, dropoutVoltage: 1.1, quiescentCurrent: 0.005 } as const;
/** 2N3904-class NPN, from the widely circulated SPICE model. */
const NPN = { polarity: "npn", saturationCurrent: 6.734e-15, forwardBeta: 416.4, reverseBeta: 0.7371, earlyVoltage: 74.03 } as const;
/** 2N3906-class PNP, from the widely circulated SPICE model. */
const PNP = { polarity: "pnp", saturationCurrent: 1.41e-15, forwardBeta: 180.7, reverseBeta: 4.977, earlyVoltage: 18.7 } as const;
/** Generic small-signal enhancement-mode MOSFETs. */
const NMOS = { channel: "n", thresholdVoltage: 2, transconductance: 0.1, channelLengthModulation: 0.01 } as const;
const PMOS = { channel: "p", thresholdVoltage: -2, transconductance: 0.05, channelLengthModulation: 0.02 } as const;

/** Golden DC circuits. Each must have no floating nodes, so ngspice and our solver both have one answer. */
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
  {
    name: "NPN common-emitter bias",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vcc", "0"], voltage: 12 },
        { id: "R1", kind: "resistor", nodes: ["vcc", "b"], resistance: 47_000 },
        { id: "R2", kind: "resistor", nodes: ["b", "0"], resistance: 10_000 },
        { id: "RC", kind: "resistor", nodes: ["vcc", "c"], resistance: 2200 },
        { id: "RE", kind: "resistor", nodes: ["e", "0"], resistance: 470 },
        { id: "Q1", kind: "bjt", nodes: ["c", "b", "e"], ...NPN },
      ],
    },
  },
  {
    name: "NPN switch driving an LED (saturated)",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vcc", "0"], voltage: 5 },
        { id: "V2", kind: "voltageSource", nodes: ["in", "0"], voltage: 3.3 },
        { id: "RB", kind: "resistor", nodes: ["in", "b"], resistance: 1000 },
        { id: "R1", kind: "resistor", nodes: ["vcc", "a"], resistance: 150 },
        { id: "D1", kind: "diode", nodes: ["a", "c"], ...RED_LED },
        { id: "Q1", kind: "bjt", nodes: ["c", "b", "0"], ...NPN },
      ],
    },
  },
  {
    name: "PNP high-side bias",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vcc", "0"], voltage: 9 },
        { id: "RE", kind: "resistor", nodes: ["vcc", "e"], resistance: 1000 },
        { id: "R1", kind: "resistor", nodes: ["vcc", "b"], resistance: 10_000 },
        { id: "R2", kind: "resistor", nodes: ["b", "0"], resistance: 47_000 },
        { id: "RC", kind: "resistor", nodes: ["c", "0"], resistance: 2200 },
        { id: "Q1", kind: "bjt", nodes: ["c", "b", "e"], ...PNP },
      ],
    },
  },
  {
    name: "n-channel MOSFET with source degeneration (saturation)",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vdd", "0"], voltage: 10 },
        { id: "R1", kind: "resistor", nodes: ["vdd", "g"], resistance: 1e6 },
        { id: "R2", kind: "resistor", nodes: ["g", "0"], resistance: 1e6 },
        { id: "RD", kind: "resistor", nodes: ["vdd", "d"], resistance: 2200 },
        { id: "RS", kind: "resistor", nodes: ["s", "0"], resistance: 1000 },
        {
          id: "M1",
          kind: "mosfet",
          nodes: ["d", "g", "s"],
          channel: "n",
          thresholdVoltage: 1.5,
          transconductance: 2e-3,
          channelLengthModulation: 0.02,
        },
      ],
    },
  },
  {
    name: "n-channel MOSFET switching an LED (triode)",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vdd", "0"], voltage: 5 },
        { id: "V2", kind: "voltageSource", nodes: ["g", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["vdd", "a"], resistance: 150 },
        { id: "D1", kind: "diode", nodes: ["a", "d"], ...RED_LED },
        { id: "M1", kind: "mosfet", nodes: ["d", "g", "0"], ...NMOS },
      ],
    },
  },
  {
    name: "p-channel MOSFET high-side switch (triode)",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vdd", "0"], voltage: 12 },
        { id: "V2", kind: "voltageSource", nodes: ["g", "0"], voltage: 0 },
        { id: "RL", kind: "resistor", nodes: ["d", "0"], resistance: 1000 },
        { id: "M1", kind: "mosfet", nodes: ["d", "g", "vdd"], ...PMOS },
      ],
    },
  },
];

/** Golden transient circuits, each run from switch-on and sampled at times that fall on a step. */
export const goldenTransient: { name: string; circuit: Circuit; check: TransientCheck }[] = [
  {
    name: "RC charge",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "out"], resistance: 1000 },
        { id: "C1", kind: "capacitor", nodes: ["out", "0"], capacitance: 1e-6 },
      ],
    },
    check: { stopTime: 5e-3, timeStep: 1e-5, at: [1e-4, 5e-4, 1e-3, 2e-3, 5e-3] },
  },
  {
    name: "RL current rise",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 12 },
        { id: "R1", kind: "resistor", nodes: ["in", "a"], resistance: 100 },
        { id: "L1", kind: "inductor", nodes: ["a", "0"], inductance: 10e-3 },
      ],
    },
    check: { stopTime: 5e-4, timeStep: 1e-6, at: [1e-5, 5e-5, 1e-4, 2e-4, 5e-4] },
  },
  {
    name: "series RLC ringing",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "a"], resistance: 10 },
        { id: "L1", kind: "inductor", nodes: ["a", "b"], inductance: 1e-3 },
        { id: "C1", kind: "capacitor", nodes: ["b", "0"], capacitance: 1e-6 },
      ],
    },
    check: { stopTime: 1e-3, timeStep: 2e-7, at: [5e-5, 1e-4, 2.5e-4, 4e-4, 7e-4, 1e-3] },
  },
  {
    name: "LED switching on as a capacitor charges",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "R1", kind: "resistor", nodes: ["in", "a"], resistance: 1000 },
        { id: "C1", kind: "capacitor", nodes: ["a", "0"], capacitance: 10e-6 },
        { id: "D1", kind: "diode", nodes: ["a", "0"], ...RED_LED },
      ],
    },
    check: { stopTime: 5e-2, timeStep: 5e-5, at: [2e-3, 1e-2, 2e-2, 3e-2, 5e-2] },
  },
  {
    name: "3.3 V regulator feeding an RC filter",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["in", "0"], voltage: 5 },
        { id: "U1", kind: "linearRegulator", nodes: ["in", "out", "0"], ...LDO_3V3 },
        { id: "R1", kind: "resistor", nodes: ["out", "f"], resistance: 100 },
        { id: "C1", kind: "capacitor", nodes: ["f", "0"], capacitance: 100e-6 },
      ],
    },
    check: { stopTime: 5e-2, timeStep: 5e-5, at: [1e-3, 5e-3, 1e-2, 2e-2, 5e-2] },
  },
  {
    name: "NPN turned on through a base RC delay",
    circuit: {
      ground: "0",
      elements: [
        { id: "V1", kind: "voltageSource", nodes: ["vcc", "0"], voltage: 5 },
        { id: "RB", kind: "resistor", nodes: ["vcc", "b"], resistance: 10_000 },
        { id: "CB", kind: "capacitor", nodes: ["b", "0"], capacitance: 1e-6 },
        { id: "RC", kind: "resistor", nodes: ["vcc", "c"], resistance: 1000 },
        { id: "Q1", kind: "bjt", nodes: ["c", "b", "0"], ...NPN },
      ],
    },
    check: { stopTime: 3e-2, timeStep: 2e-5, at: [1e-3, 1.4e-3, 2e-3, 5e-3, 3e-2] },
  },
];
