import type { ComponentSpec } from "@echidna/core";

import towerCoolerSingle from "../parts/tower-cooler-single.json";
import capacitorCeramic from "../parts/capacitor-ceramic.json";
import towerCoolerDual from "../parts/tower-cooler-dual.json";
import ryzen77800x3d from "../parts/ryzen-7-7800x3d.json";
import raspberryPi4 from "../parts/raspberry-pi-4.json";
import raspberryPi5 from "../parts/raspberry-pi-5.json";
import arduinoUnoR4 from "../parts/arduino-uno-r4.json";
import coreI714700k from "../parts/core-i7-14700k.json";
import rtx4070Super from "../parts/rtx-4070-super.json";
import aioCooler360 from "../parts/aio-cooler-360.json";
import esp32Devkitc from "../parts/esp32-devkitc.json";
import ryzen97950x from "../parts/ryzen-9-7950x.json";
import coreI512400 from "../parts/core-i5-12400.json";
import ddr532gbKit from "../parts/ddr5-32gb-kit.json";
import ddr432gbKit from "../parts/ddr4-32gb-kit.json";
import ryzen57600 from "../parts/ryzen-5-7600.json";
import nvmeSsd1tb from "../parts/nvme-ssd-1tb.json";
import nmos2n7000 from "../parts/nmos-2n7000.json";
import switchSpst from "../parts/switch-spst.json";
import switchPush from "../parts/switch-push.json";
import npn2n3904 from "../parts/npn-2n3904.json";
import pnp2n3906 from "../parts/pnp-2n3906.json";
import pmosBs250 from "../parts/pmos-bs250.json";
import rx7800Xt from "../parts/rx-7800-xt.json";
import dcSupply from "../parts/dc-supply.json";
import x670eAtx from "../parts/x670e-atx.json";
import psu1000w from "../parts/psu-1000w.json";
import resistor from "../parts/resistor.json";
import b650Atx from "../parts/b650-atx.json";
import b760Atx from "../parts/b760-atx.json";
import rtx4060 from "../parts/rtx-4060.json";
import rtx4090 from "../parts/rtx-4090.json";
import psu550w from "../parts/psu-550w.json";
import psu750w from "../parts/psu-750w.json";
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
  b650Atx,
  b760Atx,
  x670eAtx,
  ryzen57600,
  ryzen77800x3d,
  ryzen97950x,
  coreI512400,
  coreI714700k,
  rtx4060,
  rtx4070Super,
  rtx4090,
  rx7800Xt,
  ddr532gbKit,
  ddr432gbKit,
  nvmeSsd1tb,
  towerCoolerSingle,
  towerCoolerDual,
  aioCooler360,
  psu550w,
  psu750w,
  psu1000w,
] as unknown as ComponentSpec[];

export const partsById: ReadonlyMap<string, ComponentSpec> = new Map(parts.map((p) => [p.id, p]));
