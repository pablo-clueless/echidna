import { defaultRules } from "@echidna/rules";
import { describe, expect, it } from "vitest";
import { parts } from "@echidna/library";

import { editableParams } from "@/lib/project/model";
import en from "@/messages/en.json";

describe("data-driven message keys", () => {
  it.each(parts.map((p) => [p.id, p] as const))("part %s has a name and summary", (id) => {
    expect(en.Parts).toHaveProperty([id, "name"]);
    expect(en.Parts).toHaveProperty([id, "summary"]);
  });

  it.each(parts.filter((p) => p.variants).map((p) => [p.id, p] as const))("part %s names its variants", (id, part) => {
    expect(en.Parts).toHaveProperty([id, "variantLabel"]);
    for (const variant of part.variants ?? []) expect(en.Parts).toHaveProperty([id, "variants", variant.id]);
  });

  it.each(defaultRules.map((r) => r.id))("rule %s has a name and explanation", (id) => {
    expect(en.Studio.rules).toHaveProperty([id, "name"]);
    expect(en.Studio.rules).toHaveProperty([id, "explain"]);
  });

  it("every user-editable parameter has a label", () => {
    for (const key of parts.flatMap(editableParams)) {
      expect(en.Studio.params).toHaveProperty(key);
    }
  });
});
