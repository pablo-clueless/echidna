import { describe, expect, it } from "vitest";

import { findAmericanSpellings } from "./british-english.js";

describe("findAmericanSpellings", () => {
  it("suggests the British form, keeping the original case", () => {
    expect(findAmericanSpellings("Color and behavior, centered")).toEqual([
      { word: "Color", british: "Colour", index: 0 },
      { word: "behavior", british: "behaviour", index: 10 },
      { word: "centered", british: "centred", index: 20 },
    ]);
  });

  it("matches whole words only", () => {
    expect(findAmericanSpellings("colourful decolorize centerline")).toEqual([]);
  });

  it("accepts British spellings", () => {
    expect(findAmericanSpellings("The colour of the centre behaviour")).toEqual([]);
  });
});
