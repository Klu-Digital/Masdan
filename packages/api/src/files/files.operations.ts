import type { Database } from "@masdan/db";
import { file } from "@masdan/db/schema/index";
import { storage } from "@masdan/storage";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import { assertPermission } from "../procedures";

export const fileNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "File not found" });

/** A `pending` or `failed` row may have no bytes behind it, so only `ready` presigns. */
export const presignFileDownload = async (row: {
  key: string;
  name: string;
  status: string;
}): Promise<{ downloadUrl: string }> => {
  if (row.status !== "ready") {
    throw new ORPCError("CONFLICT", {
      message: "File upload is not complete",
    });
  }

  const downloadUrl = await storage.presignDownload({
    downloadFileName: row.name,
    key: row.key,
  });

  return { downloadUrl };
};

/**
 * Deletes the row, then the object. Shared by `files.deleteFile` and
 * attachment removal so ownership and `delete:any` are decided in one place.
 */
export const deleteHouseholdFile = async (
  context: {
    db: Database;
    memberRole: string;
    organizationId: string;
    session: { user: { id: string } };
  },
  fileId: string
): Promise<{ fileId: string }> => {
  const [target] = await context.db
    .select({ userId: file.userId })
    .from(file)
    .where(
      and(eq(file.id, fileId), eq(file.organizationId, context.organizationId))
    )
    .limit(1);

  if (!target) {
    throw fileNotFound();
  }

  // The route check established "may delete files at all"; ownership decides
  // whose. Roles can't express that, hence `delete:any` and a check on the row.
  if (target.userId !== context.session.user.id) {
    assertPermission(context, { file: ["delete:any"] });
  }

  const [row] = await context.db
    .delete(file)
    .where(
      and(eq(file.id, fileId), eq(file.organizationId, context.organizationId))
    )
    .returning();

  if (!row) {
    throw fileNotFound();
  }

  // After the row write: the transaction can still roll back, and an orphaned
  // object is recoverable in a way a deleted one is not.
  await storage.deleteObject({ key: row.key });

  return { fileId: row.id };
};
