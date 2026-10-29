import { describe, expect, it } from "vitest";

import { anyEstimated, compareViolations, isDeviceType, type Violation } from "./index";

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
