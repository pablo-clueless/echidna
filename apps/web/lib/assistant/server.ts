import Anthropic from "@anthropic-ai/sdk";

import type { AssistantErrorCode } from "./protocol";

let client: Anthropic | null = null;

/**
 * The shared Anthropic client. Credentials come from the environment, usually `ANTHROPIC_API_KEY` in `.env.local`.
 * @returns The client, or null when no credentials are configured.
 */
export const anthropic = (): Anthropic | null => {
  try {
    client ??= new Anthropic();
    return client;
  } catch {
    return null;
  }
};

/**
 * Sorts an error from the Anthropic SDK into what the studio tells the user.
 * @param error - Anything thrown while calling the API.
 * @returns The error code for the studio.
 */
export const errorCode = (error: unknown): AssistantErrorCode => {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "unconfigured";
  }
  if (error instanceof Anthropic.RateLimitError) return "rateLimited";
  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return "unavailable";
  }
  if (error instanceof Anthropic.APIError && error.status === 413) return "tooLarge";
  if (error instanceof Anthropic.BadRequestError) return "badRequest";
  if (error instanceof Anthropic.APIError && error.status === 529) return "unavailable";
  return "failed";
};

/**
 * A JSON error response in the same shape the stream's error events use.
 * @param code - The error code.
 * @param status - The HTTP status.
 * @returns The response.
 */
export const errorResponse = (code: AssistantErrorCode, status: number) =>
  Response.json({ type: "error", code }, { status, headers: { "Cache-Control": "no-store" } });
