import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import type { AssistantErrorCode, AssistantEvent, UploadedAttachment } from "./protocol";

const ENDPOINT = "/api/v1/assistant";

const codeOf = async (response: Response): Promise<AssistantErrorCode> => {
  const body = (await response.json().catch(() => null)) as { code?: AssistantErrorCode } | null;
  return body?.code ?? "failed";
};

/**
 * Sends the conversation to the assistant route and yields its events as they stream in.
 * @param messages - The whole conversation so far, ending with the user's turn or tool results.
 * @param signal - Aborts the request, such as when the user presses stop.
 * @returns The stream's events; a failed request yields a single `error` event.
 */
export const streamTurn = async function* (
  messages: BetaMessageParam[],
  signal: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted) throw error;
    return null;
  });
  if (!response) {
    yield { type: "error", code: "unavailable" };
    return;
  }
  if (!response.ok || !response.body) {
    yield { type: "error", code: await codeOf(response) };
    return;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as AssistantEvent;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as AssistantEvent;
};

/**
 * Uploads a file for the assistant to read.
 * @param file - An image, PDF or text file.
 * @returns The uploaded attachment, or the reason it was refused.
 */
export const uploadAttachment = async (
  file: File,
): Promise<{ attachment: UploadedAttachment } | { error: AssistantErrorCode }> => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${ENDPOINT}/files`, { method: "POST", body: form }).catch(
    () => null,
  );
  if (!response) return { error: "unavailable" };
  if (!response.ok) return { error: await codeOf(response) };
  return { attachment: (await response.json()) as UploadedAttachment };
};

/**
 * Deletes an uploaded attachment. Best effort: the file expires on its own if this fails.
 * @param fileId - The attachment's file ID.
 */
export const deleteAttachment = (fileId: string): void => {
  void fetch(`${ENDPOINT}/files?id=${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch(
    () => {},
  );
};
