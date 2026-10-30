const prefixes: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

const formatters = new Map<string, Intl.NumberFormat>();

/** `Intl.NumberFormat` is slow to construct and readouts format dozens of values per render, so reuse them. */
const numberFormat = (locale: string, digits?: number): Intl.NumberFormat => {
  const key = `${locale}|${digits ?? ""}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, digits === undefined ? undefined : { maximumSignificantDigits: digits });
    formatters.set(key, format);
  }
  return format;
};

const separators = (locale: string) => {
  const parts = numberFormat(locale).formatToParts(12345.6);
  return {
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
  };
};

/**
 * Parses a number typed in the user's locale, with an optional SI prefix and unit symbol:
 * `7,6` in French, `4.7k`, `4k7`, `10 µF`, `1 234,5 Ω`.
 * @param input - Raw text from an input.
 * @param locale - The active locale, which decides the decimal separator.
 * @param unit - Unit symbol to ignore if typed, such as `Ω`.
 * @returns The value in base SI units, or `null` if the text is not a number.
 */
export const parseQuantity = (input: string, locale: string, unit = ""): number | null => {
  const { decimal, group } = separators(locale);
  let text = input.trim().replace(/\s+/g, "");
  if (unit && text.endsWith(unit)) text = text.slice(0, -unit.length);
  if (!text) return null;

  const rkm = /^(\d+)([pnuµμmkKMG])(\d+)$/.exec(text);
  if (rkm) {
    const [, whole = "", prefix = "", fraction = ""] = rkm;
    return Number(`${whole}.${fraction}`) * (prefixes[prefix] ?? 1);
  }

  let scale = 1;
  const last = text.at(-1) ?? "";
  if (last in prefixes) {
    scale = prefixes[last] ?? 1;
    text = text.slice(0, -1);
  }

  const normalised = (group.trim() ? text.split(group).join("") : text.replace(/[  ]/g, ""))
    .split(decimal)
    .join(".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(normalised)) return null;
  return Number(normalised) * scale;
};

const engineering = [
  { exp: 9, symbol: "G" },
  { exp: 6, symbol: "M" },
  { exp: 3, symbol: "k" },
  { exp: 0, symbol: "" },
  { exp: -3, symbol: "m" },
  { exp: -6, symbol: "µ" },
  { exp: -9, symbol: "n" },
  { exp: -12, symbol: "p" },
];

/**
 * Formats a value with an SI prefix and the locale's digits and separators, such as `4,7 kΩ` in French.
 * @param value - Value in base SI units.
 * @param unit - Unit symbol, never translated.
 * @param locale - Active locale.
 * @param digits - Significant digits.
 * @returns Display text. Values too small for the smallest prefix, such as leakage left over from the solver, read
 * as zero, and dimensionless values (unit `""` or `"1"`) take no prefix.
 */
export const formatQuantity = (value: number, unit: string, locale: string, digits = 3): string => {
  if (unit === "" || unit === "1") return numberFormat(locale, digits).format(value);
  const magnitude = Math.abs(value) < 0.5e-12 ? 0 : Math.abs(value);
  if (magnitude === 0) return `${numberFormat(locale, digits).format(0)} ${unit}`;
  const step = engineering.find((e) => magnitude >= 10 ** e.exp * 0.9995) ?? engineering.at(-1);
  const scaled = value / 10 ** (step?.exp ?? 0);
  const number = numberFormat(locale, digits).format(scaled);
  return `${number} ${step?.symbol ?? ""}${unit}`;
};
