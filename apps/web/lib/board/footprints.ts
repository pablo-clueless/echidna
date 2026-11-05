/** Board-side geometry for generic footprints. All lengths in millimetres, x along the part, z across it. */

export type Pad = {
  pin: string;
  x: number;
  z: number;
  w: number;
  h: number;
  shape: "rect" | "round";
  /** Plated hole diameter for through-hole pads. */
  drill?: number;
};

export type SilkShape =
  | { kind: "rect"; x: number; z: number; w: number; h: number }
  | { kind: "circle"; x: number; z: number; r: number; flatX?: number }
  | { kind: "line"; points: [number, number][] }
  | { kind: "dot"; x: number; z: number; r: number }
  | { kind: "text"; x: number; z: number; text: string; size: number };

export type Footprint = {
  pads: Pad[];
  /** Keep-out rectangle around the part, centred on the origin; drawn as the selection and verdict outline. */
  courtyard: { w: number; h: number };
  silk: SilkShape[];
  /** Where the designator (R1, U1…) is printed. */
  ref: { x: number; z: number };
};

const tht = (
  pin: string,
  x: number,
  size: number,
  drill: number,
  shape: Pad["shape"] = "round",
): Pad => ({
  pin,
  x,
  z: 0,
  w: size,
  h: size,
  shape,
  drill,
});

/** TO-92 body outline: a 3.5 mm arc behind the pads and a flat face 1.6 mm in front of them. */
const TO92_OUTLINE: [number, number][] = (() => {
  const [r, flat] = [3.5, 1.6];
  const a = Math.asin(flat / r);
  return Array.from({ length: 41 }, (_, i): [number, number] => {
    const t = -a + (i / 40) * (Math.PI + 2 * a);
    return [r * Math.cos(t), -r * Math.sin(t)];
  }).concat([[r * Math.cos(-a), flat]]);
})();

/**
 * Inline TO-92 on a 2.54 mm pitch, the formed-lead layout hobby boards use. Pin 1 is the square pad on the left.
 * @param pins - Pin IDs from left to right, seen from the flat face.
 * @returns The footprint.
 */
const to92 = (pins: [string, string, string]): Footprint => ({
  pads: pins.map((pin, i) => tht(pin, (i - 1) * 2.54, 1.6, 0.9, i === 0 ? "rect" : "round")),
  courtyard: { w: 7.6, h: 7.4 },
  silk: [{ kind: "line", points: TO92_OUTLINE }],
  ref: { x: 0, z: -4.4 },
});

/**
 * A single-row 2.54 mm pin header, where a dev board or sensor module connects to this board. Pin 1 is square.
 * @param pins - Pin IDs from left to right.
 * @param label - Printed beside the header, such as the module's name.
 * @returns The footprint.
 */
const pinHeader = (pins: string[], label: string): Footprint => {
  const width = pins.length * 2.54;
  return {
    pads: pins.map((pin, i) =>
      tht(pin, (i - (pins.length - 1) / 2) * 2.54, 1.7, 1.0, i === 0 ? "rect" : "round"),
    ),
    courtyard: { w: width + 0.6, h: 3.2 },
    silk: [
      { kind: "rect", x: 0, z: 0, w: width, h: 2.54 },
      { kind: "text", x: 0, z: 2.6, text: label, size: 1.2 },
    ],
    ref: { x: 0, z: -2.4 },
  };
};

/**
 * A desktop module's outline, drawn smaller than life so a whole build fits on the board. Modules plug into slots
 * rather than being soldered, so it has no pads.
 * @param w - Width in millimetres.
 * @param h - Depth in millimetres.
 * @param label - Printed in the middle.
 * @returns The footprint.
 */
const moduleOutline = (w: number, h: number, label: string): Footprint => ({
  pads: [],
  courtyard: { w: w + 1, h: h + 1 },
  silk: [
    { kind: "rect", x: 0, z: 0, w, h },
    { kind: "text", x: 0, z: 0, text: label, size: 2 },
  ],
  ref: { x: 0, z: -h / 2 - 1.6 },
});

export const footprints: Record<string, Footprint> = {
  "module/motherboard": moduleOutline(40, 32, "ATX"),
  "module/cpu": moduleOutline(12, 12, "CPU"),
  "module/gpu": moduleOutline(32, 12, "GPU"),
  "module/memory": moduleOutline(24, 5, "RAM"),
  "module/storage": moduleOutline(18, 6, "M.2"),
  "module/cooler": moduleOutline(14, 14, "COOLER"),
  "module/psu": moduleOutline(22, 16, "PSU"),
  "module/laptopBoard": moduleOutline(36, 22, "LAPTOP"),
  "module/battery": moduleOutline(30, 10, "BATT"),
  "module/wifi": moduleOutline(6, 8, "WI-FI"),
  "module/display": moduleOutline(36, 4, "eDP"),
  "module/charger": moduleOutline(10, 8, "DC IN"),
  "header/raspberry-pi": pinHeader(["3v3", "5v", "gnd", "sda", "scl", "gpio23", "gpio24"], "RPI"),
  "header/esp32-devkitc": pinHeader(["3v3", "5v", "gnd", "sda", "scl", "gpio4", "gpio5"], "ESP32"),
  "header/arduino-uno-r4": pinHeader(["3v3", "5v", "gnd", "sda", "scl", "d2", "d3"], "UNO R4"),
  "header/bme280": pinHeader(["vdd", "gnd", "sda", "scl"], "BME280"),
  "header/hc-sr04": pinHeader(["vcc", "trig", "echo", "gnd"], "HC-SR04"),
  "header/ds18b20": pinHeader(["vdd", "dq", "gnd"], "DS18B20"),
  "generic/axial-0.4in": {
    pads: [tht("1", -5.08, 2.0, 1.0), tht("2", 5.08, 2.0, 1.0)],
    courtyard: { w: 12.6, h: 3.4 },
    silk: [
      { kind: "rect", x: 0, z: 0, w: 6.8, h: 2.9 },
      {
        kind: "line",
        points: [
          [-3.4, 0],
          [-4.05, 0],
        ],
      },
      {
        kind: "line",
        points: [
          [3.4, 0],
          [4.05, 0],
        ],
      },
    ],
    ref: { x: 0, z: -2.4 },
  },
  "generic/0805": {
    pads: [
      { pin: "1", x: -0.95, z: 0, w: 1.0, h: 1.45, shape: "rect" },
      { pin: "2", x: 0.95, z: 0, w: 1.0, h: 1.45, shape: "rect" },
    ],
    courtyard: { w: 3.4, h: 1.9 },
    silk: [
      {
        kind: "line",
        points: [
          [-0.25, -0.95],
          [0.25, -0.95],
        ],
      },
      {
        kind: "line",
        points: [
          [-0.25, 0.95],
          [0.25, 0.95],
        ],
      },
    ],
    ref: { x: 0, z: -1.75 },
  },
  "generic/sot-223": {
    pads: [
      { pin: "gnd", x: -2.3, z: 3.15, w: 0.95, h: 2.15, shape: "rect" },
      { pin: "out", x: 0, z: 3.15, w: 0.95, h: 2.15, shape: "rect" },
      { pin: "in", x: 2.3, z: 3.15, w: 0.95, h: 2.15, shape: "rect" },
      { pin: "out", x: 0, z: -3.15, w: 3.25, h: 2.15, shape: "rect" },
    ],
    courtyard: { w: 7.4, h: 8.6 },
    silk: [
      {
        kind: "line",
        points: [
          [-3.4, -1.9],
          [-3.4, 1.9],
          [-2.95, 1.9],
        ],
      },
      {
        kind: "line",
        points: [
          [3.4, -1.9],
          [3.4, 1.9],
          [2.95, 1.9],
        ],
      },
      {
        kind: "line",
        points: [
          [-3.4, -1.9],
          [-1.85, -1.9],
        ],
      },
      {
        kind: "line",
        points: [
          [3.4, -1.9],
          [1.85, -1.9],
        ],
      },
      { kind: "dot", x: -3.9, z: 3.6, r: 0.22 },
    ],
    ref: { x: 0, z: -4.9 },
  },
  "generic/led-5mm": {
    pads: [tht("a", -1.27, 1.9, 1.0), tht("k", 1.27, 1.9, 1.0, "rect")],
    courtyard: { w: 6.6, h: 6.6 },
    silk: [{ kind: "circle", x: 0, z: 0, r: 3.05, flatX: 2.55 }],
    ref: { x: 0, z: -3.9 },
  },
  "generic/switch-slide": {
    pads: [tht("1", -2, 1.6, 0.9, "rect"), tht("2", 2, 1.6, 0.9)],
    courtyard: { w: 9.2, h: 4.4 },
    silk: [{ kind: "rect", x: 0, z: 0, w: 8.6, h: 3.8 }],
    ref: { x: 0, z: -2.9 },
  },
  "generic/switch-tactile": {
    pads: [tht("1", -3.25, 1.8, 1.0, "rect"), tht("2", 3.25, 1.8, 1.0)],
    courtyard: { w: 9, h: 7 },
    silk: [
      { kind: "rect", x: 0, z: 0, w: 6.4, h: 6.4 },
      { kind: "circle", x: 0, z: 0, r: 1.9 },
    ],
    ref: { x: 0, z: -4.2 },
  },
  "generic/to-92-ebc": to92(["e", "b", "c"]),
  "generic/to-92-sgd": to92(["s", "g", "d"]),
  "generic/to-92-dgs": to92(["d", "g", "s"]),
  "generic/terminal-2": {
    pads: [tht("pos", -2.54, 2.4, 1.3), tht("neg", 2.54, 2.4, 1.3, "rect")],
    courtyard: { w: 10.9, h: 8.4 },
    silk: [
      { kind: "rect", x: 0, z: 0.2, w: 10.4, h: 7.8 },
      { kind: "text", x: -2.54, z: 2.6, text: "+", size: 1.6 },
      { kind: "text", x: 2.54, z: 2.6, text: "−", size: 1.6 },
    ],
    ref: { x: 0, z: -4.75 },
  },
};

const bandColours = [
  "#1B1B1B", // black
  "#6B3A1E", // brown
  "#C0392B", // red
  "#E67E22", // orange
  "#F1C40F", // yellow
  "#2E8B57", // green
  "#2E5FA8", // blue
  "#7D3C98", // violet
  "#8A8A8A", // grey
  "#F2F2F2", // white
];
const GOLD = "#C9A23F";
const SILVER = "#BFC3C7";

/**
 * Four-band resistor colour code for a value, with a 5 % gold tolerance band.
 * @param ohms - Resistance in ohms.
 * @returns Band colours, first to last, or `null` if the value cannot be printed in two significant digits.
 */
export const resistorBands = (ohms: number): string[] | null => {
  if (!(ohms >= 0.1) || !Number.isFinite(ohms)) return null;
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    exponent += 1;
  }
  if (exponent > 9) return null;
  const multiplier = exponent === -1 ? GOLD : exponent === -2 ? SILVER : bandColours[exponent];
  const first = bandColours[Math.floor(digits / 10)];
  const second = bandColours[digits % 10];
  if (!first || !second || !multiplier) return null;
  return [first, second, multiplier, GOLD];
};

export type Drill = { x: number; z: number; diameter: number };

/** A pad placed on the board, in board millimetres. */
export type PlacedPad = {
  pin: string;
  x: number;
  z: number;
  /** Radius of a circle that covers the pad, for clearance checks. */
  radius: number;
  drill?: number | undefined;
};

/**
 * Board positions of a placed footprint's pads.
 * @param footprint - Footprint to place.
 * @param x - Part origin across the board, in millimetres.
 * @param z - Part origin along the board's depth, in millimetres.
 * @param rotation - Part rotation in degrees, clockwise seen from above, as stored on the board.
 * @returns Each pad's centre, covering radius and drill.
 */
export const placePads = (
  footprint: Footprint,
  x: number,
  z: number,
  rotation: number,
): PlacedPad[] => {
  const angle = (-rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return footprint.pads.map((pad) => ({
    pin: pad.pin,
    x: x + pad.x * cos + pad.z * sin,
    z: z - pad.x * sin + pad.z * cos,
    radius: pad.shape === "round" ? pad.w / 2 : Math.hypot(pad.w, pad.h) / 2,
    drill: pad.drill,
  }));
};

/**
 * Board positions of a placed footprint's plated holes.
 * @param footprint - Footprint to drill.
 * @param x - Part origin across the board, in millimetres.
 * @param z - Part origin along the board's depth, in millimetres.
 * @param rotation - Part rotation in degrees, clockwise seen from above, as stored on the board.
 * @returns One drill per through-hole pad.
 */
export const drillsFor = (footprint: Footprint, x: number, z: number, rotation: number): Drill[] =>
  placePads(footprint, x, z, rotation).flatMap((pad) =>
    pad.drill === undefined ? [] : [{ x: pad.x, z: pad.z, diameter: pad.drill }],
  );
