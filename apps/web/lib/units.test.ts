import { describe, expect, it } from "vitest";

import { formatQuantity, fromCelsius, parseQuantity, toCelsius } from "./units";

describe("parseQuantity", () => {
  it.each([
    ["en", "7.6", 7.6],
    ["en", "1,234.5", 1234.5],
    ["fr", "7,6", 7.6],
    ["fr", "1 234,5", 1234.5],
    ["fr", "1 234,5", 1234.5],
    ["fr", "7.6", 7.6],
    ["es", "7,6", 7.6],
    ["es", "1.234,5", 1234.5],
    ["ru", "7,6", 7.6],
    ["ru", "1 234,5", 1234.5],
    ["zh", "7.6", 7.6],
    ["ja", "1,234.5", 1234.5],
  ])("%s reads %j as %d", (locale, input, expected) => {
    expect(parseQuantity(input, locale)).toBeCloseTo(expected, 9);
  });

  it.each([
    ["4.7k", 4700],
    ["4k7", 4700],
    ["2M2", 2.2e6],
    ["10µ", 1e-5],
    ["10u", 1e-5],
    ["100n", 1e-7],
    ["68", 68],
    ["1e-3", 1e-3],
    ["-5", -5],
  ])("reads SI prefixes in %j", (input, expected) => {
    expect(parseQuantity(input, "en")).toBeCloseTo(expected, 12);
  });

  it("ignores the unit symbol and surrounding spaces", () => {
    expect(parseQuantity(" 4,7 kΩ ", "fr", "Ω")).toBeCloseTo(4700, 9);
    expect(parseQuantity("10 µF", "en", "F")).toBeCloseTo(1e-5, 12);
  });

  it.each(["", "abc", "1.2.3", "k", "--5", "Ω"])("rejects %j", (input) => {
    expect(parseQuantity(input, "en", "Ω")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("reads values below a picounit as zero, never as a long negative fraction", () => {
    expect(formatQuantity(-8.88e-20, "V", "en")).toBe("0 V");
    expect(formatQuantity(3e-13, "A", "en")).toBe("0 A");
    expect(formatQuantity(2e-12, "A", "en")).toBe("2 pA");
  });

  it("shows temperatures in degrees Celsius, never with a prefix", () => {
    expect(formatQuantity(298.15, "K", "en")).toBe("25 °C");
    expect(formatQuantity(332.15, "K", "fr")).toBe("59 °C");
    expect(formatQuantity(268.05, "K", "en")).toBe("-5.1 °C");
    expect(fromCelsius(toCelsius(373.15))).toBeCloseTo(373.15, 9);
  });

  it("gives dimensionless values no prefix", () => {
    expect(formatQuantity(0.7371, "1", "en", 4)).toBe("0.7371");
    expect(formatQuantity(416.4, "", "fr", 4)).toBe("416,4");
  });

  it("chooses an SI prefix", () => {
    expect(formatQuantity(4700, "Ω", "en")).toBe("4.7 kΩ");
    expect(formatQuantity(0.0187, "A", "en")).toBe("18.7 mA");
    expect(formatQuantity(1e-5, "F", "en")).toBe("10 µF");
    expect(formatQuantity(0, "V", "en")).toBe("0 V");
    expect(formatQuantity(3.3, "V", "en")).toBe("3.3 V");
  });

  it("uses the locale's decimal separator", () => {
    expect(formatQuantity(4700, "Ω", "fr")).toBe("4,7 kΩ");
    expect(formatQuantity(3.3, "V", "ru")).toBe("3,3 V");
  });

  it("does not round 999.7 up into the wrong prefix", () => {
    expect(formatQuantity(0.9997, "A", "en")).toBe("1 A");
    expect(formatQuantity(0.999, "A", "en")).toBe("999 mA");
  });
});
