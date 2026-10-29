import { describe, expect, it } from "vitest";
import { contrastRatio, WCAG_AA_NON_TEXT, WCAG_AA_TEXT } from "../src/contrast";
import { palette } from "../src/palette";
import { themes, type ThemeName } from "../src/themes";
import { toCss } from "../src/css";

const statuses = ["Fail", "Warn", "Pass"] as const;
const themeNames = Object.keys(themes) as ThemeName[];

describe("contrastRatio", () => {
  it("matches known reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio(palette.ink, palette.cream)).toBe(contrastRatio(palette.cream, palette.ink));
  });

  it("rejects malformed colours", () => {
    expect(() => contrastRatio("orange", "#FFFFFF")).toThrow();
  });
});

describe.each(themeNames)("%s theme meets WCAG AA", (name) => {
  const t = themes[name];

  it("body text on surface", () => {
    expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it("primary-text on surface", () => {
    expect(contrastRatio(t.primaryText, t.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it("text on primary buttons", () => {
    expect(contrastRatio(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it("primary is distinguishable from surface for focus and selection", () => {
    expect(contrastRatio(t.primary, t.surface)).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
  });

  it.each(statuses)("%s status text on surface", (status) => {
    expect(contrastRatio(t[`status${status}Text`], t.surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(statuses)("%s status label on its fill", (status) => {
    expect(contrastRatio(t[`status${status}OnFill`], t[`status${status}Fill`])).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(["Fail", "Pass"] as const)("%s status fill against surface", (status) => {
    expect(contrastRatio(t[`status${status}Fill`], t.surface)).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
  });

  it("warn status fill or its border against surface", () => {
    const best = Math.max(contrastRatio(t.statusWarnFill, t.surface), contrastRatio(t.statusWarnBorder, t.surface));
    expect(best).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
  });
});

describe("brand and status separation", () => {
  it("never uses the primary orange as a status colour", () => {
    const brand = new Set<string>([palette.orange500, palette.orange700]);
    for (const t of Object.values(themes)) {
      const statusValues = Object.entries(t)
        .filter(([key]) => key.startsWith("status"))
        .map(([, value]) => value);
      expect(statusValues.some((v) => brand.has(v))).toBe(false);
    }
  });
});

describe("toCss", () => {
  const css = toCss();

  it("emits both themes and honours the system preference", () => {
    expect(css).toContain(`--colour-surface: ${palette.cream};`);
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
  });

  it("adds script fallbacks only for ru, zh and ja", () => {
    expect(css).toContain(':lang(ru)');
    expect(css).toContain('"Noto Sans SC"');
    expect(css).toContain('"Noto Sans JP"');
    expect(css).not.toContain(':lang(fr)');
  });
});
