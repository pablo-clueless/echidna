import { describe, expect, it } from "vitest";

import { anyEstimated, compareViolations, type ComponentSpec, isDeviceType, type Violation, withVariant } from "./index";

const violation = (overrides: Partial<Violation>): Violation => ({
  componentId: "c1",
  ruleId: "max-current",
  actual: 1,
  limit: 1,
  unit: "A",
  severity: "pass",
  estimated: false,
  ...overrides,
});

describe("isDeviceType", () => {
  it("accepts known types and rejects others", () => {
    expect(isDeviceType("drone")).toBe(true);
    expect(isDeviceType("toaster")).toBe(false);
  });
});

describe("anyEstimated", () => {
  it("detects an estimated input among measured ones", () => {
    expect(
      anyEstimated([
        { value: 5, unit: "V", source: "datasheet" },
        undefined,
        { value: 0.2, unit: "A", source: "estimated" },
      ]),
    ).toBe(true);
    expect(anyEstimated([{ value: 5, unit: "V", source: "teardown" }])).toBe(false);
  });
});

describe("compareViolations", () => {
  it("sorts fails first, then warns, measured before estimated", () => {
    const list = [
      violation({ componentId: "pass", severity: "pass" }),
      violation({ componentId: "warn", severity: "warn" }),
      violation({ componentId: "fail-est", severity: "fail", estimated: true }),
      violation({ componentId: "fail", severity: "fail" }),
    ];
    expect(list.sort(compareViolations).map((v) => v.componentId)).toEqual(["fail", "fail-est", "warn", "pass"]);
  });
});

describe("withVariant", () => {
  const base: ComponentSpec = {
    id: "led",
    name: "LED",
    kind: "led",
    deviceTypes: [],
    pins: [],
    params: { saturationCurrent: { value: 1, unit: "A", source: "datasheet" }, emissionCoefficient: { value: 2, unit: "1", source: "datasheet" } },
    ratings: {},
    interfaces: [],
    variants: [{ id: "red" }, { id: "blue", params: { saturationCurrent: { value: 3, unit: "A", source: "estimated" } } }],
    model: "diode",
    footprintId: "",
    meshUrl: "",
  };

  it("applies the chosen variant's params over the base", () => {
    const blue = withVariant(base, "blue");
    expect(blue.params.saturationCurrent?.value).toBe(3);
    expect(blue.params.emissionCoefficient?.value).toBe(2);
  });

  it("falls back to the first variant", () => {
    expect(withVariant(base).params.saturationCurrent?.value).toBe(1);
    expect(withVariant(base, "violet").params.saturationCurrent?.value).toBe(1);
  });
});
