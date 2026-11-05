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

/**
 * How a switch is operated: `latching` stays where it is set, like a slide or toggle switch; `momentary` changes
 * only while it is held, like a push button, and returns to its first variant when let go.
 */
export type Actuation = "latching" | "momentary";

/** A selectable version of a part, such as an LED's colour, that replaces some of its params and ratings. */
export type Variant = {
  id: string;
  params?: Record<string, SpecValue>;
  ratings?: Ratings;
};

/** A supply a host board offers on one of its pins, such as a Raspberry Pi's 3.3 V header pin. */
export type HostRail = {
  id: string;
  /** Host pin the rail is on. */
  pinId: string;
  voltage: SpecValue;
  /** Most current the rail can supply to everything plugged into it. */
  maxCurrent: SpecValue;
};

/** A place on a host board that a part plugs into, such as an I²C header. */
export type HostSlot = {
  id: string;
  /** Protocols the slot carries, such as `i2c` or `gpio`. */
  accepts: Interface[];
  /** Rails a part in this slot can draw from, in order of preference. Module slots, powered from a PSU, have none. */
  railIds?: string[];
  /** Host pins for the slot's signals, by signal name (such as `SDA`), matched to the part's `signals`. */
  signals?: Record<string, string>;
  /** Voltage the host drives its signal pins high to. */
  logicHigh?: SpecValue;
  /** Highest voltage the host's signal pins can take. */
  maxInput?: SpecValue;
  /** Most heat a part in this slot may give off. */
  thermalBudget?: SpecValue;
};

/** What makes a part a host board: the rails it offers and the slots parts plug into. */
export type HostSpec = {
  /** The host's ground pin, which every rail is measured from. A motherboard, whose modules are not wired, has none. */
  groundPinId?: string;
  rails: HostRail[];
  slots: HostSlot[];
};

/** How a part that plugs into a slot is powered, and the levels its signal pins work at. */
export type SupplySpec = {
  pinId: string;
  groundPinId: string;
  minVoltage: SpecValue;
  maxVoltage: SpecValue;
  /** Most current the part draws from its supply. */
  current: SpecValue;
  /** Voltage the part drives its outputs high to. Defaults to its supply voltage. */
  logicHigh?: SpecValue;
  /** Highest voltage the part's signal pins can take. */
  maxInput: SpecValue;
  /** The part's signal pins by signal name, matched to the slot's `signals`. */
  signals: Record<string, string>;
};

/** What a desktop or laptop module does in the build: the role decides which device-level checks apply to it. */
export type ModuleRole =
  | "motherboard"
  | "cpu"
  | "gpu"
  | "memory"
  | "storage"
  | "cooler"
  | "psu"
  | "battery"
  | "wifi"
  | "display"
  | "charger";

/** A PSU power connector, such as the 12V-2x6 connector newer graphics cards take. */
export type PowerConnector = "atx-24pin" | "eps-8pin" | "pcie-8pin" | "12v-2x6";

/** A module of a desktop or laptop build, checked at the device level rather than solved as a circuit. */
export type ModuleSpec = {
  role: ModuleRole;
  /** Most power the module draws from the PSU under full load, such as a CPU's package power limit. */
  power?: SpecValue;
  /** For coolers: the heat they are rated to remove. */
  cooling?: SpecValue;
  /** Power drawn in light everyday use, such as browsing and video, for estimating battery runtime. */
  typical?: SpecValue;
  /**
   * For boards with the processors soldered on, such as a laptop's: the heat they give off under sustained load,
   * which the cooler has to remove.
   */
  heat?: SpecValue;
  /** For batteries: stored energy, in joules (1 Wh = 3600 J). */
  energy?: SpecValue;
  /** For PSUs and chargers: rated continuous output. */
  output?: SpecValue;
  /** PSU connectors the module needs plugged into it, by connector, such as a graphics card's 12V-2x6. */
  needs?: Partial<Record<PowerConnector, number>>;
  /** For PSUs: the connectors they have, by connector. */
  provides?: Partial<Record<PowerConnector, number>>;
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
  /** For switches: how the user operates it. Defaults to `latching`. */
  actuation?: Actuation;
  /** For host boards: the rails they offer and the slots parts plug into. */
  host?: HostSpec;
  /** For parts that plug into a host's slot: how they are powered and their signal levels. */
  supply?: SupplySpec;
  /** For desktop and laptop modules: what they draw, cool or supply in the build. */
  module?: ModuleSpec;
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
