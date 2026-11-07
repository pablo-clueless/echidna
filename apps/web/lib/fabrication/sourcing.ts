import type { ComponentSpec, NetlistComponent } from "@echidna/core";

import { paramValue } from "@/lib/project/model";

/** The E24 series, as two significant digits: the values fixed resistors are made in. */
const E24 = new Set([
  10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91,
]);

/**
 * A resistance in the code makers print in part numbers: the multiplier's letter stands in for the decimal point,
 * as in `4R7`, `150R`, `1K5` or `10K`.
 * @param ohms - The resistance.
 * @returns The code, or `undefined` for a value outside the E24 series or 1 Ω to 10 MΩ, which isn't made.
 */
export const resistanceCode = (ohms: number): string | undefined => {
  if (!(ohms >= 1 && ohms <= 10e6)) return undefined;
  const digits = ohms / 10 ** (Math.floor(Math.log10(ohms)) - 1);
  if (Math.abs(digits - Math.round(digits)) > 1e-6 || !E24.has(Math.round(digits)))
    return undefined;
  const [scale, letter] = ohms >= 1e6 ? [1e6, "M"] : ohms >= 1e3 ? [1e3, "K"] : [1, "R"];
  const [whole, fraction] = String(Number((ohms / scale).toPrecision(2))).split(".");
  return `${whole}${letter}${fraction ?? ""}`;
};

/** Fills a part number's value placeholders, by parameter. */
const CODES: Record<string, (value: number) => string | undefined> = {
  resistance: resistanceCode,
};

/** What to buy for one part on the BOM. */
export type BomSource = { manufacturer: string; mpn: string; lcsc: string };

/**
 * The part number to buy a part by, for its value as set in the project.
 * @param component - The part in the project.
 * @param spec - Its spec.
 * @returns The maker and part numbers, or `undefined` when the library has none for this part or this value.
 */
export const partSourcing = (
  component: NetlistComponent,
  spec: ComponentSpec,
): BomSource | undefined => {
  const sourcing = spec.sourcing;
  if (!sourcing) return undefined;
  const placeholders = [...sourcing.mpn.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "");
  if (placeholders.length > 0) {
    let mpn = sourcing.mpn;
    for (const key of placeholders) {
      const value = paramValue(component, spec, key);
      const code = value === undefined ? undefined : CODES[key]?.(value);
      if (!code) return undefined;
      mpn = mpn.replace(`{${key}}`, code);
    }
    return { manufacturer: sourcing.manufacturer, mpn, lcsc: "" };
  }
  // A fixed part number is for the part as the library has it: a changed value needs another part.
  const changed = Object.entries(component.paramOverrides ?? {}).some(
    ([key, value]) => spec.params[key] !== undefined && spec.params[key].value !== value,
  );
  if (changed) return undefined;
  return { manufacturer: sourcing.manufacturer, mpn: sourcing.mpn, lcsc: sourcing.lcsc ?? "" };
};
