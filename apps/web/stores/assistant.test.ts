import type {
  BetaContentBlock,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssistantEvent } from "@/lib/assistant/protocol";
import { MAX_STEPS, useAssistantStore } from "./assistant";
import { useProjectStore } from "./project";

vi.hoisted(() => {
  const items = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  });
});

/** Scripted assistant turns, one per request, and the conversations each request was sent. */
const turns: AssistantEvent[][] = [];
const sent: BetaMessageParam[][] = [];

vi.mock("@/lib/assistant/api", () => ({
  streamTurn: async function* (messages: BetaMessageParam[]) {
    sent.push(structuredClone(messages));
    for (const event of turns.shift() ?? [{ type: "error", code: "failed" }]) yield event;
  },
  deleteAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
}));

const toolTurn = (id: string, name: string, input: Record<string, unknown>): AssistantEvent[] => [
  { type: "tool", name },
  {
    type: "done",
    stopReason: "tool_use",
    content: [{ type: "tool_use", id, name, input } as BetaContentBlock],
  },
];

const textTurn = (text: string): AssistantEvent[] => [
  { type: "text", text },
  {
    type: "done",
    stopReason: "end_turn",
    content: [{ type: "text", text, citations: null } as BetaContentBlock],
  },
];

const assistant = () => useAssistantStore.getState();
const project = () => useProjectStore.getState();

/** Lets the store's async loop run until it settles. */
const settle = () => vi.waitFor(() => expect(assistant().status).not.toBe("streaming"));

describe("the assistant loop", () => {
  beforeEach(() => {
    turns.length = 0;
    sent.length = 0;
    assistant().reset();
    project().clear();
  });

  it("applies changes straight away in auto mode and carries on", async () => {
    assistant().setMode("auto");
    turns.push(toolTurn("t1", "add_part", { specId: "resistor" }), textTurn("Added R1."));
    assistant().send("Add a resistor", []);
    await settle();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    await settle();

    expect(project().components).toEqual([{ id: "R1", specId: "resistor" }]);
    const results = sent[1]!.at(-1)!.content as { type: string; tool_use_id: string }[];
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(assistant().entries.at(-1)).toMatchObject({ kind: "assistant", text: "Added R1." });
    expect(assistant().undoSnapshot).not.toBeNull();
  });

  it("waits for approval in manual mode, then applies", async () => {
    assistant().setMode("manual");
    turns.push(toolTurn("t1", "add_part", { specId: "resistor" }), textTurn("Done."));
    assistant().send("Add a resistor", []);
    await settle();

    expect(assistant().status).toBe("awaiting");
    expect(project().components).toEqual([]);

    assistant().apply();
    await settle();
    await vi.waitFor(() => expect(assistant().status).toBe("idle"));
    expect(project().components).toHaveLength(1);
  });

  it("runs read-only tools without asking, even in manual mode", async () => {
    assistant().setMode("manual");
    turns.push(toolTurn("t1", "get_project", {}), textTurn("It's empty."));
    assistant().send("What's in my project?", []);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    await settle();
    expect(assistant().status).toBe("idle");
  });

  it("declines rejected changes and sends the decline with the next message", async () => {
    assistant().setMode("manual");
    turns.push(toolTurn("t1", "add_part", { specId: "resistor" }));
    assistant().send("Add a resistor", []);
    await settle();
    assistant().reject();
    expect(project().components).toEqual([]);

    turns.push(textTurn("OK."));
    assistant().send("Never mind", []);
    await settle();
    await vi.waitFor(() => expect(assistant().status).toBe("idle"));

    const conversation = sent.at(-1)!;
    const roles = conversation.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "user"]);
    expect(conversation[2]!.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "t1", is_error: true }),
    ]);
  });

  it("puts the project back on undo and tells the assistant next time", async () => {
    assistant().setMode("auto");
    turns.push(toolTurn("t1", "add_part", { specId: "resistor" }), textTurn("Added."));
    assistant().send("Add a resistor", []);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    await settle();

    assistant().undo();
    expect(project().components).toEqual([]);

    turns.push(textTurn("Noted."));
    assistant().send("Thanks", []);
    await settle();
    const last = sent.at(-1)!.at(-1)!.content as { type: string; text: string }[];
    expect(last.at(-1)!.text).toContain("undid");
  });

  it("stops a runaway request", async () => {
    assistant().setMode("auto");
    for (let i = 0; i <= MAX_STEPS; i++) turns.push(toolTurn(`t${i}`, "get_project", {}));
    assistant().send("Loop", []);
    await vi.waitFor(() =>
      expect(assistant().entries.at(-1)).toMatchObject({ kind: "notice", code: "tooManySteps" }),
    );
    expect(sent).toHaveLength(MAX_STEPS + 1);
  });

  it("leaves a turn cut off mid tool call out of the conversation", async () => {
    turns.push([
      {
        type: "done",
        stopReason: "max_tokens",
        content: [{ type: "tool_use", id: "t1", name: "add_part", input: {} } as BetaContentBlock],
      },
    ]);
    assistant().send("Add a resistor", []);
    await settle();
    expect(assistant().history.map((m) => m.role)).toEqual(["user"]);
    expect(assistant().entries.at(-1)).toMatchObject({ kind: "notice", code: "truncated" });
  });

  it("sends attachments as file blocks before the text", async () => {
    turns.push(textTurn("A datasheet."));
    assistant().send("What is this?", [
      { fileId: "file_a", name: "ds.pdf", kind: "document", size: 10 },
      { fileId: "file_b", name: "board.png", kind: "image", size: 10 },
    ]);
    await settle();
    expect(sent[0]![0]!.content).toEqual([
      { type: "document", source: { type: "file", file_id: "file_a" }, title: "ds.pdf" },
      { type: "image", source: { type: "file", file_id: "file_b" } },
      { type: "text", text: "What is this?" },
    ]);
  });
});
