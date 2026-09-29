import { ORPCError } from "@orpc/server";
import { z } from "zod";

/**
 * Codes whose messages are written for the person using the app. Declared once
 * on the base builder, so every procedure answers them as defined errors and
 * the web client (`isDefinedError`) can show their messages; anything else —
 * INTERNAL_SERVER_ERROR, a crash — reaches it undefined and is never shown raw.
 */
export const domainErrors = {
  BAD_REQUEST: {},
  CONFLICT: {},
  FORBIDDEN: {},
  NOT_FOUND: {},
  PRECONDITION_FAILED: {},
  TOO_MANY_REQUESTS: { data: z.object({ retryAfter: z.number() }) },
  UNAUTHORIZED: {},
};

/** `notFound("Transaction")` → NOT_FOUND "Transaction not found". A foreign id reads as missing too. */
export const notFound = (entity: string) =>
  new ORPCError("NOT_FOUND", { message: `${entity} not found` });
