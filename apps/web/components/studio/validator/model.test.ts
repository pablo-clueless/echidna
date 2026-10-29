import type { Violation } from "@echidna/core";
import { describe, expect, it } from "vitest";

import { countIssues, drawerMode, toIssues, verdictKey } from "./model";

const violation = (componentId: string, severity: Violation["severity"], estimated = false): Violation => ({
  componentId,
  ruleId: "max-current",
  actual: 1,
  limit: 1,
  unit: "A",
  severity,
  estimated,
});

describe("toIssues", () => {
  it("drops passes and sorts worst first", () => {
    const issues = toIssues([violation("a", "pass"), violation("b", "warn"), violation("c", "fail")]);
    expect(issues.map((v) => v.componentId)).toEqual(["c", "b"]);
  });
});

describe("drawerMode", () => {
  it("is clean with no issues, whatever the expanded flag", () => {
    expect(drawerMode(0, false)).toBe("clean");
    expect(drawerMode(0, true)).toBe("clean");
  });

  it("peeks by default and expands on request", () => {
    expect(drawerMode(3, false)).toBe("peek");
    expect(drawerMode(3, true)).toBe("expanded");
  });
});

describe("countIssues", () => {
  it("counts fails and warns separately", () => {
    expect(countIssues([violation("a", "fail"), violation("b", "warn"), violation("c", "warn")])).toEqual({
      fails: 1,
      warns: 2,
    });
  });
});

describe("verdictKey", () => {
  it("softens fails that rest on estimates", () => {
    expect(verdictKey(violation("a", "fail"))).toBe("fail");
    expect(verdictKey(violation("a", "fail", true))).toBe("likelyFail");
    expect(verdictKey(violation("a", "warn", true))).toBe("warn");
  });
});
