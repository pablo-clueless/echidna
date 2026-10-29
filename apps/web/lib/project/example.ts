import type { ProjectData, Wire } from "./model";

const wire = (id: string, a: string, b: string): Wire => {
  const pin = (s: string) => {
    const [componentId = "", pinId = ""] = s.split(".");
    return { componentId, pinId };
  };
  return { id, a: pin(a), b: pin(b) };
};

/**
 * The Phase 1 starter circuit: a 5 V supply feeding a 3.3 V LDO that drives a red LED through a 150 Ω resistor.
 * @returns Fresh project data, safe to mutate.
 */
export const regulatorExample = (): ProjectData => ({
  name: "",
  components: [
    { id: "V1", specId: "dc-supply" },
    { id: "U1", specId: "ldo-3v3" },
    { id: "R1", specId: "resistor", paramOverrides: { resistance: 150 } },
    { id: "D1", specId: "led-red-5mm" },
    { id: "GND1", specId: "ground" },
  ],
  wires: [
    wire("W1", "V1.pos", "U1.in"),
    wire("W2", "U1.out", "R1.1"),
    wire("W3", "R1.2", "D1.a"),
    wire("W4", "V1.neg", "GND1.gnd"),
    wire("W5", "U1.gnd", "GND1.gnd"),
    wire("W6", "D1.k", "GND1.gnd"),
  ],
  schematic: {
    V1: { x: 2, y: 5, rotation: 0 },
    U1: { x: 7, y: 3, rotation: 0 },
    R1: { x: 13, y: 3, rotation: 0 },
    D1: { x: 17, y: 5, rotation: 90 },
    GND1: { x: 7, y: 8, rotation: 0 },
  },
  board: {
    V1: { x: -0.036, z: 0, rotation: 90 },
    U1: { x: -0.014, z: 0, rotation: 0 },
    R1: { x: 0.01, z: 0, rotation: 0 },
    D1: { x: 0.03, z: 0, rotation: 0 },
  },
});
