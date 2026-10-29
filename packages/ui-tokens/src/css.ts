import { fontSize, fontWeight, lineHeight, monoStack, sansStack, type Locale } from "./typography";
import { radius, space } from "./spacing";
import { themes, type ThemeColours } from "./themes";

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const declarations = (prefix: string, values: Record<string | number, string>): string[] =>
  Object.entries(values).map(([key, value]) => `  --${prefix}-${kebab(key)}: ${value};`);

const colourDeclarations = (colours: ThemeColours): string[] => declarations("colour", colours);

const locales: Locale[] = ["en", "fr", "es", "zh", "ja", "ru"];

/**
 * Renders every token as CSS custom properties. Light is the default; dark applies via
 * `[data-theme="dark"]` or the system preference when no theme is set explicitly.
 * @returns A complete stylesheet.
 */
export const toCss = (): string => {
  const base = [
    ...colourDeclarations(themes.light),
    ...declarations("space", space),
    ...declarations("radius", radius),
    ...declarations("font-size", fontSize),
    ...declarations("line-height", lineHeight),
    ...declarations("font-weight", fontWeight),
    `  --font-sans: ${sansStack("en")};`,
    `  --font-mono: ${monoStack};`,
    "  color-scheme: light;",
  ];
  const dark = [...colourDeclarations(themes.dark), "  color-scheme: dark;"];
  const localeRules = locales
    .filter((locale) => sansStack(locale) !== sansStack("en"))
    .map((locale) => `:root:lang(${locale}) {\n  --font-sans: ${sansStack(locale)};\n}`);

  return [
    `:root {\n${base.join("\n")}\n}`,
    `:root[data-theme="dark"] {\n${dark.join("\n")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark.map((d) => `  ${d}`).join("\n")}\n  }\n}`,
    ...localeRules,
    "",
  ].join("\n\n");
};
