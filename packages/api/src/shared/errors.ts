import { ORPCError } from "@orpc/server";
import { z } from "zod";

// Only these codes' messages are shown to people; everything else stays hidden.
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
