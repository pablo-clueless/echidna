export type Provenance = "datasheet" | "teardown" | "estimated";

export type Unit =
  | "V"
  | "A"
  | "W"
  | "Ω"
  | "F"
  | "H"
  | "K"
  | "m"
  | "kg"
  | "s"
  | "Hz"
  | "N"
  | "J"
  | "C"
  | "W/K"
  | "K/W"
  | "A/V²"
  | "1/V"
  | "1";

export type SpecValue = {
  value: number;
  unit: Unit;
  source: Provenance;
  reference?: string;
};

export const deviceTypes = ["smartphone", "desktop", "laptop", "drone", "iot", "wearable"] as const;

export type DeviceType = (typeof deviceTypes)[number];

export type Interface = {
  protocol: string;
  lanes?: number;
  connector?: string;
};

export type PinDef = {
  id: string;
  name: string;
};

export type Ratings = {
  maxVoltage?: SpecValue;
  maxCurrent?: SpecValue;
  maxPower?: SpecValue;
  maxTemperature?: SpecValue;
};

export type Attribution = {
  source: string;
  licence: string;
  url?: string;
};

/** A selectable version of a part, such as an LED's colour, that replaces some of its params and ratings. */
export type Variant = {
  id: string;
  params?: Record<string, SpecValue>;
  ratings?: Ratings;
};

export type ComponentSpec = {
  id: string;
  name: string;
  kind: string;
  deviceTypes: DeviceType[];
  pins: PinDef[];
  params: Record<string, SpecValue>;
  ratings: Ratings;
  /** Pins each rating is measured across. Defaults to every pin. */
  ratingPins?: Partial<Record<keyof Ratings, string[]>>;
  interfaces: Interface[];
  /** Versions the user can choose between. The first is the default. */
  variants?: Variant[];
  model: string;
  footprintId: string;
  meshUrl: string;
  attribution?: Attribution;
};

/**
 * Type guard for device type strings arriving from untrusted input such as JSON or URLs.
 * @param value - Any string.
 * @returns Whether the value is a known device type.
 */
export const isDeviceType = (value: string): value is DeviceType =>
  (deviceTypes as readonly string[]).includes(value);

/**
 * Applies a variant's params and ratings over the base spec.
 * @param spec - The part spec.
 * @param variantId - The chosen variant; unknown or missing IDs fall back to the first variant.
 * @returns The spec as the chosen variant, or `spec` itself when it has no variants.
 */
export const withVariant = (spec: ComponentSpec, variantId?: string): ComponentSpec => {
  const variant = spec.variants?.find((v) => v.id === variantId) ?? spec.variants?.[0];
  if (!variant) return spec;
  return {
    ...spec,
    params: { ...spec.params, ...variant.params },
    ratings: { ...spec.ratings, ...variant.ratings },
  };
};

/**
 * Reports whether any of the given spec values is an estimate, so verdicts derived from them can be softened.
 * @param values - Spec values used as inputs to a rule; `undefined` entries are ignored.
 * @returns `true` if at least one value has `estimated` provenance.
 */
export const anyEstimated = (values: ReadonlyArray<SpecValue | undefined>): boolean =>
  values.some((v) => v?.source === "estimated");
