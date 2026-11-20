import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaStopReason,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

/** What the studio sends to `POST /api/v1/assistant`: the whole conversation, which the browser keeps. */
export type AssistantRequest = { messages: BetaMessageParam[] };

export type AssistantErrorCode =
  | "unconfigured"
  | "rateLimited"
  | "unavailable"
  | "badRequest"
  | "tooLarge"
  | "forbidden"
  | "failed";

/**
 * One line of the newline-delimited JSON the assistant route streams back. `done` carries the assistant's whole turn,
 * which goes back unchanged in the next request, thinking and fallback blocks included.
 */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "tool"; name: string }
  | { type: "done"; content: BetaContentBlock[]; stopReason: BetaStopReason | null }
  | { type: "error"; code: AssistantErrorCode };

export type AttachmentKind = "image" | "document";

/** A file uploaded for the assistant through `POST /api/v1/assistant/files`. */
export type UploadedAttachment = {
  fileId: string;
  name: string;
  kind: AttachmentKind;
  size: number;
};

export const IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Text files go to the API as plain text documents. */
export const TEXT_TYPES: ReadonlySet<string> = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  "txt",
  "csv",
  "md",
  "json",
  "cir",
  "net",
  "sp",
]);

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

/** File picker `accept` list for the attachment button. */
export const ATTACHMENT_ACCEPT = [
  ...IMAGE_TYPES,
  "application/pdf",
  ...TEXT_TYPES,
  ...[...TEXT_EXTENSIONS].map((ext) => `.${ext}`),
].join(",");

/**
 * Sorts a file into what the API takes it as, from its type or, for text files browsers give no type, its extension.
 * @param name - The file name.
 * @param type - The file's MIME type, possibly empty.
 * @returns The block kind and the MIME type to upload it as, or null when the assistant can't read it.
 */
export const classifyAttachment = (
  name: string,
  type: string,
): { kind: AttachmentKind; mediaType: string } | null => {
  if (IMAGE_TYPES.has(type)) return { kind: "image", mediaType: type };
  if (type === "application/pdf") return { kind: "document", mediaType: type };
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (TEXT_TYPES.has(type) || type.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    return { kind: "document", mediaType: "text/plain" };
  }
  return null;
};
