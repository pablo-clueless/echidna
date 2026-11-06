import type { DeviceType, SpecValue } from "@echidna/core";

/** A ready-made desktop, laptop or drone: a motherboard or frame and the part in each of its slots. */
export type BuildPreset = {
  id: string;
  deviceType: DeviceType;
  /** The motherboard's or frame's part ID. */
  hostId: string;
  /** Part ID in each of the host's slots, by slot ID. */
  modules: Record<string, string>;
  /** For drones: the maker's published flight time, which the hover estimate is checked against. */
  flightTime?: SpecValue;
};

/**
 * How far a drone preset's estimated hover time may stray from the maker's published flight time, as a fraction of
 * it. Makers measure flying forward slowly, which takes a little less power than a hover, and several inputs to the
 * estimate are themselves estimates.
 */
export const FLIGHT_TIME_TOLERANCE = 0.1;

/**
 * The reference builds: budget, gaming and workstation desktops, an ultrabook and a gaming laptop, three DJI Minis and
 * a 5-inch FPV quad.
 */
export const builds: readonly BuildPreset[] = [
  {
    id: "desktop-budget",
    deviceType: "desktop",
    hostId: "b760-atx",
    modules: {
      cpu: "core-i5-12400",
      cooler: "tower-cooler-single",
      "pcie-x16": "rtx-4060",
      memory: "ddr5-32gb-kit",
      m2: "nvme-ssd-1tb",
      power: "psu-550w",
    },
  },
  {
    id: "desktop-gaming",
    deviceType: "desktop",
    hostId: "b650-atx",
    modules: {
      cpu: "ryzen-7-7800x3d",
      cooler: "tower-cooler-dual",
      "pcie-x16": "rtx-4070-super",
      memory: "ddr5-32gb-kit",
      m2: "nvme-ssd-1tb",
      power: "psu-750w",
    },
  },
  {
    id: "desktop-workstation",
    deviceType: "desktop",
    hostId: "x670e-atx",
    modules: {
      cpu: "ryzen-9-7950x",
      cooler: "aio-cooler-360",
      "pcie-x16": "rtx-4090",
      memory: "ddr5-32gb-kit",
      m2: "nvme-ssd-1tb",
      power: "psu-1000w",
    },
  },
  {
    id: "laptop-ultrabook",
    deviceType: "laptop",
    hostId: "ultrabook-board",
    modules: {
      m2: "nvme-ssd-1tb",
      wifi: "wifi-6e-card",
      battery: "battery-3s-54wh",
      display: "display-14-fhd",
      cooler: "laptop-cooler-thin",
      "dc-in": "charger-usbc-65w",
    },
  },
  {
    id: "laptop-gaming",
    deviceType: "laptop",
    hostId: "gaming-laptop-board",
    modules: {
      memory: "sodimm-ddr5-16gb",
      m2: "nvme-ssd-1tb",
      wifi: "wifi-6e-card",
      battery: "battery-4s-80wh",
      display: "display-16-qhd-165",
      cooler: "laptop-cooler-vapour-chamber",
      "dc-in": "charger-barrel-240w",
    },
  },
  {
    id: "drone-dji-mini-2",
    deviceType: "drone",
    hostId: "dji-mini-2-frame",
    modules: {
      motors: "dji-mini-2-motors",
      propellers: "dji-mini-2-propellers",
      battery: "dji-mini-2-battery",
      camera: "dji-mini-2-gimbal",
    },
    flightTime: {
      value: 31 * 60,
      unit: "s",
      source: "datasheet",
      reference: "DJI Mini 2 specifications: 31 minutes, measured flying at 17 km/h in still air",
    },
  },
  {
    id: "drone-dji-mini-3-pro",
    deviceType: "drone",
    hostId: "dji-mini-3-pro-frame",
    modules: {
      motors: "dji-mini-3-motors",
      propellers: "dji-mini-3-propellers",
      battery: "dji-mini-3-battery",
      camera: "dji-mini-3-pro-gimbal",
    },
    flightTime: {
      value: 34 * 60,
      unit: "s",
      source: "datasheet",
      reference:
        "DJI Mini 3 Pro specifications: 34 minutes, measured flying at 21.6 km/h in still air",
    },
  },
  {
    id: "drone-dji-mini-4-pro",
    deviceType: "drone",
    hostId: "dji-mini-4-pro-frame",
    modules: {
      motors: "dji-mini-3-motors",
      propellers: "dji-mini-3-propellers",
      battery: "dji-mini-4-pro-battery",
      camera: "dji-mini-4-pro-gimbal",
    },
    flightTime: {
      value: 34 * 60,
      unit: "s",
      source: "datasheet",
      reference:
        "DJI Mini 4 Pro specifications: 34 minutes, measured flying at 21.6 km/h in still air",
    },
  },
  {
    id: "drone-fpv-5in",
    deviceType: "drone",
    hostId: "fpv-frame-5in",
    modules: {
      motors: "motors-2207-1950kv",
      propellers: "props-5in-triblade",
      battery: "lipo-4s-1500-120c",
      esc: "esc-4in1-45a",
      fc: "fc-f7-30x30",
      camera: "fpv-camera-analog",
    },
  },
];
