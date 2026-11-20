import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { NextRequest } from "next/server";

import { anthropic, errorCode, errorResponse } from "@/lib/assistant/server";
import type { AssistantEvent } from "@/lib/assistant/protocol";
import { systemPrompt } from "@/lib/assistant/prompt";
import { assistantOpen } from "@/lib/assistant/gate";
import { apiTools } from "@/lib/assistant/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL = process.env.ASSISTANT_MODEL ?? "claude-opus-5-5";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 400;

const SYSTEM = systemPrompt();
const TOOLS = apiTools();

const isMessage = (m: unknown): m is BetaMessageParam => {
  if (typeof m !== "object" || m === null) return false;
  const { role, content } = m as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    (typeof content === "string" || (Array.isArray(content) && content.length > 0))
  );
};

/**
 * Parses and checks the conversation the studio sends.
 * @param body - The parsed JSON body.
 * @returns The messages, or null when the body isn't a conversation the API would take.
 */
const parseMessages = (body: unknown): BetaMessageParam[] | null => {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return null;
  if (!messages.every(isMessage) || messages[0]?.role !== "user") return null;
  return messages;
};

/**
 * Runs one assistant turn: sends the conversation to Claude and streams the reply back as newline-delimited JSON
 * {@link AssistantEvent}s. Tool calls are not run here: they act on the project in the browser, which runs them and
 * sends their results in the next request.
 */
export const POST = async (request: NextRequest) => {
  if (!assistantOpen(request.headers.get("host"), Boolean(process.env.VERCEL))) {
    return errorResponse("forbidden", 404);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return errorResponse("tooLarge", 413);
  }
  const messages = parseMessages(await request.json().catch(() => null));
  if (!messages) return errorResponse("badRequest", 400);
  const client = anthropic();
  if (!client) return errorResponse("unconfigured", 503);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const send = (event: AssistantEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 32000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            cache_control: { type: "ephemeral" },
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            tools: TOOLS,
            messages,
          },
          { signal: request.signal },
        );
        for await (const event of stream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "thinking") send({ type: "thinking" });
            if (event.content_block.type === "tool_use") {
              send({ type: "tool", name: event.content_block.name });
            }
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "text", text: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        send({ type: "done", content: message.content, stopReason: message.stop_reason });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[assistant]", error);
          send({ type: "error", code: errorCode(error) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
};
