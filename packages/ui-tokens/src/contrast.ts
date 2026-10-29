const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * Computes WCAG 2.x relative luminance of a `#RRGGBB` colour.
 * @param hex - Six-digit hex colour.
 * @returns Luminance between 0 and 1.
 */
export const relativeLuminance = (hex: string): number => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = match.slice(1).map((part) => channel(parseInt(part, 16))) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Computes the WCAG contrast ratio between two `#RRGGBB` colours.
 * @param a - First colour.
 * @param b - Second colour.
 * @returns Ratio from 1 to 21.
 */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_NON_TEXT = 3;
