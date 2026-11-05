import type { ComponentSpec } from "@echidna/core";

import capacitorCeramic from "../parts/capacitor-ceramic.json";
import raspberryPi4 from "../parts/raspberry-pi-4.json";
import raspberryPi5 from "../parts/raspberry-pi-5.json";
import arduinoUnoR4 from "../parts/arduino-uno-r4.json";
import esp32Devkitc from "../parts/esp32-devkitc.json";
import nmos2n7000 from "../parts/nmos-2n7000.json";
import switchSpst from "../parts/switch-spst.json";
import switchPush from "../parts/switch-push.json";
import npn2n3904 from "../parts/npn-2n3904.json";
import pnp2n3906 from "../parts/pnp-2n3906.json";
import pmosBs250 from "../parts/pmos-bs250.json";
import dcSupply from "../parts/dc-supply.json";
import resistor from "../parts/resistor.json";
import ds18b20 from "../parts/ds18b20.json";
import led5mm from "../parts/led-5mm.json";
import ldo3v3 from "../parts/ldo-3v3.json";
import hcSr04 from "../parts/hc-sr04.json";
import ground from "../parts/ground.json";
import bme280 from "../parts/bme280.json";

/** Every bundled part. The JSON is checked against `schema/component.schema.json` in tests. */
export const parts = [
  dcSupply,
  ground,
  resistor,
  capacitorCeramic,
  switchSpst,
  switchPush,
  led5mm,
  ldo3v3,
  npn2n3904,
  pnp2n3906,
  nmos2n7000,
  pmosBs250,
  raspberryPi4,
  raspberryPi5,
  esp32Devkitc,
  arduinoUnoR4,
  bme280,
  hcSr04,
  ds18b20,
] as unknown as ComponentSpec[];

export const partsById: ReadonlyMap<string, ComponentSpec> = new Map(parts.map((p) => [p.id, p]));
