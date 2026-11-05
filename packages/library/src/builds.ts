import type { DeviceType } from "@echidna/core";

/** A ready-made device: a motherboard and the part in each of its slots. */
export type BuildPreset = {
  id: string;
  deviceType: DeviceType;
  /** The motherboard's part ID. */
  hostId: string;
  /** Part ID in each of the motherboard's slots, by slot ID. */
  modules: Record<string, string>;
};

/** The desktop reference builds: budget, gaming and workstation. */
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
];
