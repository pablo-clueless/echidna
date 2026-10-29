import { describe, expect, it } from "vitest";

import { missingKeys, withFallback } from "./messages";
import en from "../messages/en.json";
import { locales } from "./routing";

describe("withFallback", () => {
  it("fills missing keys from the fallback and keeps translated ones", () => {
    const merged = withFallback(
      { A: { x: "x-en", y: "y-en" }, b: "b-en" },
      { A: { x: "x-fr" } },
    );
    expect(merged).toEqual({ A: { x: "x-fr", y: "y-en" }, b: "b-en" });
  });

  it("ignores keys that are not in the fallback", () => {
    expect(withFallback({ a: "en" }, { a: "fr", extra: "fr" })).toEqual({ a: "fr" });
  });
});

describe("missingKeys", () => {
  it("reports dotted paths for missing strings", () => {
    expect(missingKeys({ A: { x: "1", y: "2" }, b: "3" }, { A: { x: "1" } })).toEqual(["A.y", "b"]);
  });
});

describe.each(locales.filter((l) => l !== "en"))("%s messages", (locale) => {
  it("contain no keys that English lacks", async () => {
    const messages = (await import(`../messages/${locale}.json`)).default;
    expect(missingKeys(messages, en)).toEqual([]);
  });
});
