/** Heat overlay colours, in degrees Celsius: yellow when warm through red and magenta to near white when very hot. */
export const HEAT_STOPS = [
  { celsius: 25, colour: [253, 224, 71] },
  { celsius: 60, colour: [239, 68, 68] },
  { celsius: 100, colour: [217, 70, 239] },
  { celsius: 150, colour: [250, 232, 255] },
] as const;

const [FIRST, LAST] = [HEAT_STOPS[0], HEAT_STOPS[HEAT_STOPS.length - 1] ?? HEAT_STOPS[0]];

/** The temperatures the heat scale spans, in degrees Celsius. */
export const HEAT_RANGE = { low: FIRST.celsius, high: LAST.celsius } as const;

/** Rise above the air, in kelvin, at which a part's glow reaches full strength. */
const FULL_GLOW_RISE = 20;
const MAX_OPACITY = 0.85;

const hex = (channels: readonly number[]) => `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The heat overlay's colour for a temperature, on a fixed scale so the same colour always means the same heat.
 * @param celsius - Estimated temperature in degrees Celsius.
 * @returns A `#rrggbb` colour, held at the end colours outside the scale.
 */
export const heatColour = (celsius: number): string => {
  if (celsius <= FIRST.celsius) return hex(FIRST.colour);
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [a, b] = [HEAT_STOPS[i - 1], HEAT_STOPS[i]];
    if (!a || !b || celsius > b.celsius) continue;
    const t = (celsius - a.celsius) / (b.celsius - a.celsius);
    return hex(a.colour.map((c, k) => c + ((b.colour[k] ?? c) - c) * t));
  }
  return hex(LAST.colour);
};

/**
 * How strongly a part glows: not at all at the air temperature, rising with the heat it gives off, so cool parts stay
 * clear even when the air itself is hot.
 * @param rise - Temperature above the surrounding air, in kelvin.
 * @returns Opacity from 0 to `MAX_OPACITY`.
 */
export const heatOpacity = (rise: number): number => Math.min(1, Math.max(0, rise / FULL_GLOW_RISE)) * MAX_OPACITY;

/**
 * The scale as a CSS gradient, for the legend.
 * @returns A left-to-right `linear-gradient`.
 */
export const heatGradient = (): string => {
  const { low, high } = HEAT_RANGE;
  const stops = HEAT_STOPS.map((s) => `${hex(s.colour)} ${((s.celsius - low) / (high - low)) * 100}%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
};
