import type { ComponentSpec } from "@echidna/core";

import capacitorCeramic from "../parts/capacitor-ceramic.json";
import ledRed5mm from "../parts/led-red-5mm.json";
import dcSupply from "../parts/dc-supply.json";
import resistor from "../parts/resistor.json";
import ldo3v3 from "../parts/ldo-3v3.json";
import ground from "../parts/ground.json";

/** Every bundled part. The JSON is checked against `schema/component.schema.json` in tests. */
export const parts = [dcSupply, ground, resistor, capacitorCeramic, ledRed5mm, ldo3v3] as unknown as ComponentSpec[];

export const partsById: ReadonlyMap<string, ComponentSpec> = new Map(parts.map((p) => [p.id, p]));
