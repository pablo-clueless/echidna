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
 * A desktop or laptop module's outline at life size: what it covers of the chassis floor or the board it plugs into.
 * Modules plug into slots rather than being soldered, so it has no pads.
 * @param w - Width in millimetres.
 * @param h - Depth in millimetres.
 * @param label - Printed in the middle, scaled to the outline.
 * @returns The footprint.
 */
const moduleOutline = (w: number, h: number, label: string): Footprint => ({
  pads: [],
  courtyard: { w: w + 1, h: h + 1 },
  silk: [
    { kind: "rect", x: 0, z: 0, w, h },
    { kind: "text", x: 0, z: 0, text: label, size: Math.min(8, Math.max(2, Math.min(w, h) / 4)) },
  ],
  ref: { x: 0, z: -h / 2 - 2.5 },
});

/**
 * The shape of a family of drones, in millimetres, shared by its frame, motor set and propeller set so the three
 * line up wherever they are seated: each motor sits `arm` from the frame's centre along both axes, on an arm
 * `armHeight` tall.
 */
export type DroneLayout = {
  arm: number;
  armHeight: number;
  /** The frame's central body, x across and z front to back. */
  body: { w: number; d: number; h: number };
  motor: { radius: number; height: number };
  /** Propeller tip-to-tip diameter, and how many blades each has. */
  prop: { diameter: number; blades: number };
  /** Moulded plastic, like a DJI Mini, or a carbon plate frame with standoffs, like an FPV quad. */
  build: "moulded" | "carbon";
};

/**
 * Drone families by footprint suffix: the DJI Mini 2 (213 mm diagonal), the Mini 3 Pro and Mini 4 Pro (about
 * 247 mm), and a 5-inch FPV frame (220 mm).
 */
export const DRONE_LAYOUTS: Record<string, DroneLayout> = {
  mini2: {
    arm: 75,
    armHeight: 7,
    body: { w: 58, d: 138, h: 24 },
    motor: { radius: 6.5, height: 9 },
    prop: { diameter: 119, blades: 2 },
    build: "moulded",
  },
  mini3: {
    arm: 87,
    armHeight: 8,
    body: { w: 62, d: 148, h: 26 },
    motor: { radius: 7, height: 10 },
    prop: { diameter: 152, blades: 2 },
    build: "moulded",
  },
  fpv5: {
    arm: 78,
    armHeight: 5,
    body: { w: 42, d: 128, h: 30 },
    motor: { radius: 14, height: 17 },
    prop: { diameter: 130, blades: 3 },
    build: "carbon",
  },
};

/**
 * The layout a drone footprint, such as `drone/motors-mini2`, belongs to.
 * @param footprintId - A `drone/` footprint ID.
 * @returns Its family's layout, or undefined for any other footprint.
 */
export const droneLayoutOf = (footprintId: string): DroneLayout | undefined =>
  footprintId.startsWith("drone/") ? DRONE_LAYOUTS[footprintId.split("-").at(-1) ?? ""] : undefined;

/** Outlines for a drone family's frame, motor set and propeller set, each covering what it reaches. */
const droneFootprints = Object.fromEntries(
  Object.entries(DRONE_LAYOUTS).flatMap(([family, layout]) => {
    const motors = 2 * (layout.arm + layout.motor.radius);
    const props = 2 * layout.arm + layout.prop.diameter;
    return [
      [`drone/frame-${family}`, moduleOutline(motors, motors, "FRAME")],
      [`drone/motors-${family}`, moduleOutline(motors, motors, "MOTORS")],
      [`drone/props-${family}`, moduleOutline(props, props, "PROPS")],
    ];
  }),
);

/**
 * The shape of a phone or wearable, in millimetres, shared by its housing, battery, display and camera footprints:
 * the housing's outline, and the outlines of the parts made for it. A wearable has no camera.
 */
export type PhoneLayout = {
  width: number;
  depth: number;
  battery: { w: number; d: number };
  display: { w: number; d: number };
  camera: { w: number; d: number };
  kind: "phone" | "wearable";
};

/** Phones by footprint suffix, at their published sizes, and the generic smartwatch and fitness band. */
export const PHONE_LAYOUTS: Record<string, PhoneLayout> = {
  "iphone-13": {
    width: 71.5,
    depth: 146.7,
    battery: { w: 55.5, d: 61.6 },
    display: { w: 69.5, d: 144.7 },
    camera: { w: 24, d: 24 },
    kind: "phone",
  },
  "iphone-14": {
    width: 71.5,
    depth: 146.7,
    battery: { w: 55.5, d: 61.6 },
    display: { w: 69.5, d: 144.7 },
    camera: { w: 24, d: 24 },
    kind: "phone",
  },
  "iphone-15": {
    width: 71.6,
    depth: 147.6,
    battery: { w: 55.6, d: 62.0 },
    display: { w: 69.6, d: 145.6 },
    camera: { w: 24, d: 26 },
    kind: "phone",
  },
  "iphone-16": {
    width: 71.6,
    depth: 147.6,
    battery: { w: 55.6, d: 62.0 },
    display: { w: 69.6, d: 145.6 },
    camera: { w: 16, d: 30 },
    kind: "phone",
  },
  "iphone-17": {
    width: 71.5,
    depth: 149.6,
    battery: { w: 55.5, d: 62.8 },
    display: { w: 69.5, d: 147.6 },
    camera: { w: 16, d: 30 },
    kind: "phone",
  },
  "iphone-18-pro": {
    width: 71.9,
    depth: 150.0,
    battery: { w: 55.9, d: 63.0 },
    display: { w: 69.9, d: 148.0 },
    camera: { w: 34, d: 34 },
    kind: "phone",
  },
  "iphone-18-pro-max": {
    width: 78.0,
    depth: 163.4,
    battery: { w: 62.0, d: 68.6 },
    display: { w: 76.0, d: 161.4 },
    camera: { w: 36, d: 36 },
    kind: "phone",
  },
  "galaxy-s21": {
    width: 71.2,
    depth: 151.7,
    battery: { w: 55.2, d: 63.7 },
    display: { w: 69.2, d: 149.7 },
    camera: { w: 20, d: 46 },
    kind: "phone",
  },
  "galaxy-s22": {
    width: 70.6,
    depth: 146.0,
    battery: { w: 54.6, d: 61.3 },
    display: { w: 68.6, d: 144.0 },
    camera: { w: 18, d: 44 },
    kind: "phone",
  },
  "galaxy-s23": {
    width: 70.9,
    depth: 146.3,
    battery: { w: 54.9, d: 61.4 },
    display: { w: 68.9, d: 144.3 },
    camera: { w: 16, d: 44 },
    kind: "phone",
  },
  "galaxy-s24": {
    width: 70.6,
    depth: 147.0,
    battery: { w: 54.6, d: 61.7 },
    display: { w: 68.6, d: 145.0 },
    camera: { w: 16, d: 44 },
    kind: "phone",
  },
  "galaxy-s25": {
    width: 70.5,
    depth: 146.9,
    battery: { w: 54.5, d: 61.7 },
    display: { w: 68.5, d: 144.9 },
    camera: { w: 16, d: 44 },
    kind: "phone",
  },
  "galaxy-s26": {
    width: 71.7,
    depth: 149.6,
    battery: { w: 55.7, d: 62.8 },
    display: { w: 69.7, d: 147.6 },
    camera: { w: 16, d: 44 },
    kind: "phone",
  },
  watch: {
    width: 38,
    depth: 45,
    battery: { w: 26, d: 30 },
    display: { w: 36, d: 42 },
    camera: { w: 0, d: 0 },
    kind: "wearable",
  },
  band: {
    width: 19,
    depth: 44,
    battery: { w: 12, d: 30 },
    display: { w: 17, d: 40 },
    camera: { w: 0, d: 0 },
    kind: "wearable",
  },
};

/**
 * The layout a phone footprint, such as `phone/battery-iphone-15`, belongs to, and which of its parts it is.
 * @param footprintId - A `phone/` footprint ID.
 * @returns The part and its family's layout, or undefined for any other footprint.
 */
export const phoneLayoutOf = (
  footprintId: string,
): { part: "housing" | "battery" | "display" | "camera"; layout: PhoneLayout } | undefined => {
  const match = /^phone\/(housing|battery|display|camera)-(.+)$/.exec(footprintId);
  const layout = match?.[2] ? PHONE_LAYOUTS[match[2]] : undefined;
  return match && layout
    ? { part: match[1] as "housing" | "battery" | "display" | "camera", layout }
    : undefined;
};

/** Outlines for each phone's and wearable's housing, battery, display and camera. */
const phoneFootprints = Object.fromEntries(
  Object.entries(PHONE_LAYOUTS).flatMap(([family, l]) => [
    [`phone/housing-${family}`, moduleOutline(l.width, l.depth, "")],
    [`phone/battery-${family}`, moduleOutline(l.battery.w, l.battery.d, "BATT")],
    [`phone/display-${family}`, moduleOutline(l.display.w, l.display.d, "")],
    ...(l.camera.w > 0
      ? [[`phone/camera-${family}`, moduleOutline(l.camera.w, l.camera.d, "")]]
      : []),
  ]),
);

export const footprints: Record<string, Footprint> = {
  ...droneFootprints,
  ...phoneFootprints,
  // Life-size outlines, from the form-factor standards: ATX is 305 × 244 mm, a DIMM 133 mm long, M.2 2280 is
  // 80 × 22 mm and 2230 is 30 × 22 mm, an ATX PSU 150 × 140 mm. A graphics card stands on edge, so it covers its
  // length by its two-slot thickness.
  "module/motherboard": moduleOutline(305, 244, "ATX"),
  "module/cpu": moduleOutline(40, 40, "CPU"),
  "module/gpu": moduleOutline(267, 40, "GPU"),
  "module/memory": moduleOutline(133, 16, "DIMM"),
  "module/storage": moduleOutline(80, 22, "M.2"),
  "module/cooler": moduleOutline(125, 110, "COOLER"),
  "module/aio": moduleOutline(72, 72, "AIO"),
  "module/psu": moduleOutline(150, 140, "PSU"),
  "module/laptopBoard": moduleOutline(290, 120, "MAINBOARD"),
  "module/sodimm": moduleOutline(70, 30, "SO-DIMM"),
  "module/laptopCooler": moduleOutline(200, 70, "COOLER"),
  "module/battery": moduleOutline(250, 80, "BATTERY"),
  "module/wifi": moduleOutline(30, 22, "WI-FI"),
  // The panel stands in the open lid, so it covers only its thickness along the hinge.
  "module/display": moduleOutline(320, 6, "eDP"),
  "module/charger": moduleOutline(14, 9, "DC IN"),
  // A slim 2S pack or an FPV LiPo, a 30 × 30 mm flight stack, a gimbal camera and an FPV camera.
  "module/droneBattery": moduleOutline(36, 72, "BATT"),
  "module/esc": moduleOutline(36, 36, "ESC"),
  "module/flightController": moduleOutline(36, 36, "FC"),
  "module/gimbal": moduleOutline(30, 28, "CAM"),
  "module/fpvCamera": moduleOutline(20, 20, "CAM"),
  // A phone's SoC, modem and PMIC packages, its wireless charging coil, and a wearable's smaller parts.
  "module/soc": moduleOutline(15, 15, "SOC"),
  "module/modem": moduleOutline(11, 11, "MDM"),
  "module/pmic": moduleOutline(8, 8, "PMU"),
  "module/coil": moduleOutline(46, 46, "COIL"),
  "module/wearableSoc": moduleOutline(8, 8, "SOC"),
  "module/wearablePmic": moduleOutline(5, 5, "PMU"),
  "module/hrSensor": moduleOutline(14, 14, "HR"),
  "module/imu": moduleOutline(3, 3, ""),
  "module/haptics": moduleOutline(10, 10, "LRA"),
  "module/radio": moduleOutline(5, 5, "RF"),
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
