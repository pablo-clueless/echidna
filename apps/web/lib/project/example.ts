import { DEFAULT_AMBIENT } from "@echidna/rules";

import type { ProjectData, Wire } from "./model";

const wire = (id: string, a: string, b: string): Wire => {
  const pin = (s: string) => {
    const [componentId = "", pinId = ""] = s.split(".");
    return { componentId, pinId };
  };
  return { id, a: pin(a), b: pin(b) };
};

/**
 * The starter circuit: a 5 V supply switched by a slide switch, feeding a 3.3 V LDO that drives a red LED through a
 * 150 Ω resistor. The switch starts closed, so the LED is lit until it is switched off.
 * @returns Fresh project data, safe to mutate.
 */
export const regulatorExample = (): ProjectData => ({
  name: "",
  components: [
    { id: "V1", specId: "dc-supply" },
    { id: "SW1", specId: "switch-spst", variant: "closed" },
    { id: "U1", specId: "ldo-3v3" },
    { id: "R1", specId: "resistor", paramOverrides: { resistance: 150 } },
    { id: "D1", specId: "led-5mm", variant: "red" },
    { id: "GND1", specId: "ground" },
  ],
  wires: [
    wire("W1", "V1.pos", "SW1.1"),
    wire("W2", "SW1.2", "U1.in"),
    wire("W3", "U1.out", "R1.1"),
    wire("W4", "R1.2", "D1.a"),
    wire("W5", "V1.neg", "GND1.gnd"),
    wire("W6", "U1.gnd", "GND1.gnd"),
    wire("W7", "D1.k", "GND1.gnd"),
  ],
  schematic: {
    V1: { x: 2, y: 5, rotation: 0 },
    SW1: { x: 6, y: 3, rotation: 0 },
    U1: { x: 12, y: 3, rotation: 0 },
    R1: { x: 18, y: 3, rotation: 0 },
    D1: { x: 22, y: 5, rotation: 90 },
    GND1: { x: 12, y: 8, rotation: 0 },
  },
  board: {
    V1: { x: -0.036, z: 0, rotation: 90 },
    SW1: { x: -0.025, z: 0, rotation: 0 },
    U1: { x: -0.012, z: 0, rotation: 0 },
    R1: { x: 0.01, z: 0, rotation: 0 },
    D1: { x: 0.03, z: 0, rotation: 0 },
  },
  boardSize: { width: 100, depth: 55 },
  ambientTemperature: DEFAULT_AMBIENT,
});
