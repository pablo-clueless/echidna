import { builds, parts } from "@echidna/library";
import { defaultRules } from "@echidna/rules";
import { describe, expect, it } from "vitest";

import { BUILD_RULE_IDS } from "@/lib/project/buildChecks";
import { editableParams } from "@/lib/project/model";
import en from "@/languages/en.json";

describe("data-driven message keys", () => {
  it.each(parts.map((p) => [p.id, p] as const))("part %s has a name and summary", (id) => {
    expect(en.Parts).toHaveProperty([id, "name"]);
    expect(en.Parts).toHaveProperty([id, "summary"]);
  });

  it.each(parts.filter((p) => p.variants).map((p) => [p.id, p] as const))(
    "part %s names its variants",
    (id, part) => {
      expect(en.Parts).toHaveProperty([id, "variantLabel"]);
      for (const variant of part.variants ?? [])
        expect(en.Parts).toHaveProperty([id, "variants", variant.id]);
    },
  );

  it.each([...defaultRules.map((r) => r.id), ...BUILD_RULE_IDS])(
    "rule %s has a name and explanation",
    (id) => {
      expect(en.Studio.rules).toHaveProperty([id, "name"]);
      expect(en.Studio.rules).toHaveProperty([id, "explain"]);
    },
  );

  it.each(parts.filter((p) => p.host).map((p) => [p.id, p] as const))(
    "host %s names its slots and protocols",
    (_, part) => {
      for (const slot of part.host?.slots ?? []) {
        expect(en.Studio.slots.names).toHaveProperty([slot.id]);
        for (const i of slot.accepts)
          expect(en.Studio.slots.protocols).toHaveProperty([i.protocol]);
      }
    },
  );

  it.each(parts.filter((p) => p.supply || p.module).map((p) => [p.id, p] as const))(
    "part %s names its protocols",
    (_, part) => {
      for (const i of part.interfaces)
        expect(en.Studio.slots.protocols).toHaveProperty([i.protocol]);
    },
  );

  it.each(parts.filter((p) => p.module).map((p) => [p.id, p] as const))(
    "module %s names its PSU connectors",
    (_, part) => {
      for (const c of Object.keys({ ...part.module?.needs, ...part.module?.provides })) {
        expect(en.Studio.slots.connectors).toHaveProperty([c]);
      }
    },
  );

  it.each(builds.map((b) => b.id))("build %s has a name", (id) => {
    expect(en.Builds).toHaveProperty([id, "name"]);
  });

  it("every user-editable parameter has a label", () => {
    for (const key of parts.flatMap(editableParams)) {
      expect(en.Studio.params).toHaveProperty(key);
    }
  });
});
