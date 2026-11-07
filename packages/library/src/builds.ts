import type { DeviceType, SpecValue } from "@echidna/core";

/** A ready-made device: a motherboard, frame or logic board, and the part in each of its slots. */
export type BuildPreset = {
  id: string;
  deviceType: DeviceType;
  /** The host's part ID: a motherboard, a drone's frame, or a phone's or wearable's logic board. */
  hostId: string;
  /** Part ID in each of the host's slots, by slot ID. */
  modules: Record<string, string>;
  /** For drones: the maker's published flight time, which the hover estimate is checked against. */
  flightTime?: SpecValue;
  /** For phones: the maker's published battery life watching video, which the runtime estimate is checked against. */
  batteryLife?: SpecValue;
};

/**
 * How far a drone preset's estimated hover time may stray from the maker's published flight time, as a fraction of
 * it. Makers measure flying forward slowly, which takes a little less power than a hover, and several inputs to the
 * estimate are themselves estimates.
 */
export const FLIGHT_TIME_TOLERANCE = 0.1;

/**
 * How far a phone preset's estimated time watching video may stray from the maker's published figure, as a fraction
 * of it. The draws behind the estimate are estimates, fitted to these figures, so this guards against them drifting
 * rather than validating them.
 */
export const BATTERY_LIFE_TOLERANCE = 0.1;

/**
 * The reference builds: budget, gaming and workstation desktops, an ultrabook and a gaming laptop, three DJI Minis, a
 * 5-inch FPV quad, iPhones 13 to 17 and 18 Pro / Pro Max, Galaxy S21 to S26, a generic smartwatch and a fitness band.
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
  {
    id: "phone-iphone-13",
    deviceType: "smartphone",
    hostId: "iphone-13-board",
    modules: {
      soc: "apple-a15",
      pmic: "iphone-13-pmic",
      battery: "iphone-13-battery",
      display: "iphone-13-display",
      "rear-camera": "iphone-13-camera",
      coil: "magsafe-coil-15w",
      modem: "qualcomm-x60",
    },
    batteryLife: {
      value: 19 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 13 specifications: up to 19 hours of video playback",
    },
  },
  {
    id: "phone-iphone-14",
    deviceType: "smartphone",
    hostId: "iphone-14-board",
    modules: {
      soc: "apple-a15",
      pmic: "iphone-14-pmic",
      battery: "iphone-14-battery",
      display: "iphone-14-display",
      "rear-camera": "iphone-14-camera",
      coil: "magsafe-coil-15w",
      modem: "qualcomm-x65",
    },
    batteryLife: {
      value: 20 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 14 specifications: up to 20 hours of video playback",
    },
  },
  {
    id: "phone-iphone-15",
    deviceType: "smartphone",
    hostId: "iphone-15-board",
    modules: {
      soc: "apple-a16",
      pmic: "iphone-15-pmic",
      battery: "iphone-15-battery",
      display: "iphone-15-display",
      "rear-camera": "iphone-15-camera",
      coil: "magsafe-coil-15w",
      modem: "qualcomm-x70",
    },
    batteryLife: {
      value: 20 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 15 specifications: up to 20 hours of video playback",
    },
  },
  {
    id: "phone-iphone-16",
    deviceType: "smartphone",
    hostId: "iphone-16-board",
    modules: {
      soc: "apple-a18",
      pmic: "iphone-16-pmic",
      battery: "iphone-16-battery",
      display: "iphone-16-display",
      "rear-camera": "iphone-16-camera",
      coil: "magsafe-coil-25w",
      modem: "qualcomm-x71",
    },
    batteryLife: {
      value: 22 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 16 specifications: up to 22 hours of video playback",
    },
  },
  {
    id: "phone-iphone-17",
    deviceType: "smartphone",
    hostId: "iphone-17-board",
    modules: {
      soc: "apple-a19",
      pmic: "iphone-17-pmic",
      battery: "iphone-17-battery",
      display: "iphone-17-display",
      "rear-camera": "iphone-17-camera",
      coil: "magsafe-coil-25w",
      modem: "qualcomm-x80",
    },
    batteryLife: {
      value: 30 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 17 specifications: up to 30 hours of video playback",
    },
  },
  {
    id: "phone-iphone-18-pro",
    deviceType: "smartphone",
    hostId: "iphone-18-pro-board",
    modules: {
      soc: "apple-a20-pro",
      pmic: "iphone-18-pro-pmic",
      battery: "iphone-18-pro-battery",
      display: "iphone-18-pro-display",
      "rear-camera": "iphone-18-pro-camera",
      coil: "magsafe-coil-25w",
      modem: "apple-c2",
    },
    batteryLife: {
      value: 36 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 18 Pro specifications: up to 36 hours of video playback",
    },
  },
  {
    id: "phone-iphone-18-pro-max",
    deviceType: "smartphone",
    hostId: "iphone-18-pro-max-board",
    modules: {
      soc: "apple-a20-pro",
      pmic: "iphone-18-pro-max-pmic",
      battery: "iphone-18-pro-max-battery",
      display: "iphone-18-pro-max-display",
      "rear-camera": "iphone-18-pro-max-camera",
      coil: "magsafe-coil-25w",
      modem: "qualcomm-x80",
    },
    batteryLife: {
      value: 45 * 3600,
      unit: "s",
      source: "datasheet",
      reference: "Apple iPhone 18 Pro Max specifications: up to 45 hours of video playback",
    },
  },
  {
    id: "phone-galaxy-s21",
    deviceType: "smartphone",
    hostId: "galaxy-s21-board",
    modules: {
      soc: "snapdragon-888",
      pmic: "galaxy-s21-pmic",
      battery: "galaxy-s21-battery",
      display: "galaxy-s21-display",
      "rear-camera": "galaxy-s21-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "phone-galaxy-s22",
    deviceType: "smartphone",
    hostId: "galaxy-s22-board",
    modules: {
      soc: "snapdragon-8-gen-1",
      pmic: "galaxy-s22-pmic",
      battery: "galaxy-s22-battery",
      display: "galaxy-s22-display",
      "rear-camera": "galaxy-s22-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "phone-galaxy-s23",
    deviceType: "smartphone",
    hostId: "galaxy-s23-board",
    modules: {
      soc: "snapdragon-8-gen-2-galaxy",
      pmic: "galaxy-s23-pmic",
      battery: "galaxy-s23-battery",
      display: "galaxy-s23-display",
      "rear-camera": "galaxy-s23-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "phone-galaxy-s24",
    deviceType: "smartphone",
    hostId: "galaxy-s24-board",
    modules: {
      soc: "snapdragon-8-gen-3-galaxy",
      pmic: "galaxy-s24-pmic",
      battery: "galaxy-s24-battery",
      display: "galaxy-s24-display",
      "rear-camera": "galaxy-s24-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "phone-galaxy-s25",
    deviceType: "smartphone",
    hostId: "galaxy-s25-board",
    modules: {
      soc: "snapdragon-8-elite-galaxy",
      pmic: "galaxy-s25-pmic",
      battery: "galaxy-s25-battery",
      display: "galaxy-s25-display",
      "rear-camera": "galaxy-s25-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "phone-galaxy-s26",
    deviceType: "smartphone",
    hostId: "galaxy-s26-board",
    modules: {
      soc: "snapdragon-8-elite-gen-5-galaxy",
      pmic: "galaxy-s26-pmic",
      battery: "galaxy-s26-battery",
      display: "galaxy-s26-display",
      "rear-camera": "galaxy-s26-camera",
      coil: "galaxy-qi-coil-15w",
    },
  },
  {
    id: "wearable-smartwatch",
    deviceType: "wearable",
    hostId: "watch-board",
    modules: {
      soc: "watch-soc",
      pmic: "watch-pmic",
      radio: "wifi-bluetooth-radio",
      imu: "imu-6axis",
      battery: "watch-battery",
      display: "watch-display",
      "heart-rate": "ppg-sensor-4led",
      haptics: "linear-actuator-haptic",
    },
  },
  {
    id: "wearable-fitness-band",
    deviceType: "wearable",
    hostId: "band-board",
    modules: {
      soc: "band-soc",
      pmic: "band-pmic",
      radio: "bluetooth-le-radio",
      imu: "imu-6axis",
      battery: "band-battery",
      display: "band-display",
      "heart-rate": "ppg-sensor-2led",
      haptics: "coin-vibration-motor",
    },
  },
];
