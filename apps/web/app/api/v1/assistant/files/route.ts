import type { NextRequest } from "next/server";
import { toFile } from "@anthropic-ai/sdk";

import { anthropic, errorCode, errorResponse } from "@/lib/assistant/server";
import { assistantOpen } from "@/lib/assistant/gate";
import {
  classifyAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_IMAGE_BYTES,
  type UploadedAttachment,
} from "@/lib/assistant/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Attachments expire after a week; a conversation lives only as long as the studio tab. */
const EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

const open = (request: NextRequest) =>
  assistantOpen(request.headers.get("host"), Boolean(process.env.VERCEL));

/**
 * Uploads one attachment to the Anthropic Files API, so the conversation references it by ID instead of resending
 * its bytes every turn. Takes `multipart/form-data` with a `file` field.
 * @returns The {@link UploadedAttachment}.
 */
export const POST = async (request: NextRequest) => {
  if (!open(request)) return errorResponse("forbidden", 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse("badRequest", 400);
  const kind = classifyAttachment(file.name, file.type);
  if (!kind) return errorResponse("badRequest", 415);
  if (file.size > (kind.kind === "image" ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES)) {
    return errorResponse("tooLarge", 413);
  }
  const client = anthropic();
  if (!client) return errorResponse("unconfigured", 503);

  try {
    const uploaded = await client.files.upload({
      file: await toFile(await file.arrayBuffer(), file.name, { type: kind.mediaType }),
      expires_in_seconds: EXPIRES_IN_SECONDS,
    });
    const attachment: UploadedAttachment = {
      fileId: uploaded.id,
      name: file.name,
      kind: kind.kind,
      size: file.size,
    };
    return Response.json(attachment, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[assistant/files]", error);
    return errorResponse(errorCode(error), 502);
  }
};

/** Deletes an uploaded attachment, given as `?id=`, when the user removes it or starts a new conversation. */
export const DELETE = async (request: NextRequest) => {
  if (!open(request)) return errorResponse("forbidden", 404);
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^file_[A-Za-z0-9]+$/.test(id)) return errorResponse("badRequest", 400);
  const client = anthropic();
  if (!client) return errorResponse("unconfigured", 503);
  try {
    await client.files.delete(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[assistant/files]", error);
    return errorResponse(errorCode(error), 502);
  }
};
