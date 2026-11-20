import { builds, parts } from "@echidna/library";
import { describe, expect, it } from "vitest";

import { classifyAttachment } from "./protocol";
import { catalogueText } from "./catalogue";
import { systemPrompt } from "./prompt";
import { assistantOpen } from "./gate";
import { apiTools } from "./tools";

describe("attachments", () => {
  it("takes images, PDFs and text files", () => {
    expect(classifyAttachment("board.jpg", "image/jpeg")).toEqual({
      kind: "image",
      mediaType: "image/jpeg",
    });
    expect(classifyAttachment("ds.pdf", "application/pdf")?.kind).toBe("document");
    expect(classifyAttachment("netlist.cir", "")).toEqual({
      kind: "document",
      mediaType: "text/plain",
    });
    expect(classifyAttachment("project.json", "application/json")?.mediaType).toBe("text/plain");
  });

  it("refuses files the assistant can't read", () => {
    expect(classifyAttachment("board.step", "")).toBeNull();
    expect(classifyAttachment("clip.mp4", "video/mp4")).toBeNull();
  });
});

describe("the assistant gate", () => {
  it("is open only on this machine and never when deployed", () => {
    expect(assistantOpen("localhost:3000", false)).toBe(true);
    expect(assistantOpen("[::1]:3000", false)).toBe(true);
    expect(assistantOpen("echidna.app", false)).toBe(false);
    expect(assistantOpen("localhost:3000", true)).toBe(false);
    expect(assistantOpen(null, false)).toBe(false);
  });
});

describe("tool definitions", () => {
  it("are strict, with closed schemas that require every property", () => {
    for (const tool of apiTools()) {
      expect(tool.strict).toBe(true);
      const schema = tool.input_schema as unknown as {
        additionalProperties: boolean;
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it("have unique names", () => {
    const names = apiTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the system prompt", () => {
  it("lists every part and build", () => {
    const text = catalogueText();
    for (const part of parts) expect(text).toContain(`- ${part.id}: `);
    for (const build of builds) expect(text).toContain(`- ${build.id} [`);
  });

  it("is the same on every request, so it stays cached", () => {
    expect(systemPrompt()).toBe(systemPrompt());
  });
});
