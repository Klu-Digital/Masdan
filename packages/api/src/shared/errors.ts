import { ORPCError } from "@orpc/server";

/** `notFound("Transaction")` → NOT_FOUND "Transaction not found". A foreign id reads as missing too. */
export const notFound = (entity: string) =>
  new ORPCError("NOT_FOUND", { message: `${entity} not found` });
