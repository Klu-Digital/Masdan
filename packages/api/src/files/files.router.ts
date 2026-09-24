import { file } from "@masdan/db/schema/index";
import { env } from "@masdan/env/server";
import { buildObjectKey, sanitizeFileName, storage } from "@masdan/storage";
import { allowedContentTypes } from "@masdan/storage/content-types";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import {
  deleteHouseholdFile,
  fileNotFound,
  presignFileDownload,
} from "./files.operations";

const fileIdInput = z.object({ fileId: z.uuid() });

const createUploadInput = z.object({
  contentType: z.enum(allowedContentTypes),
  name: z.string().min(1).max(512),
  size: z
    .number()
    .int()
    .positive()
    .refine((value) => value <= env.STORAGE_MAX_UPLOAD_BYTES, {
      message: `File exceeds the maximum upload size of ${env.STORAGE_MAX_UPLOAD_BYTES} bytes`,
    }),
});

export const filesRouter = {
  /**
   * Size and content type come from the bucket, never the request. Deliberately
   * not an `orgMutationProcedure`: the miss path records `status: "failed"` and
   * then throws, which a transaction would roll straight back.
   */
  confirmUpload: orgProcedure
    .use(requirePermission({ file: ["create"] }))
    .input(fileIdInput)
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select()
        .from(file)
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.organizationId, context.organizationId)
          )
        )
        .limit(1);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "File not found" });
      }

      const metadata = await storage.headObject({ key: row.key });

      if (!metadata) {
        await context.db
          .update(file)
          .set({ status: "failed" })
          .where(eq(file.id, row.id));
        throw new ORPCError("NOT_FOUND", {
          message: "Upload was never completed",
        });
      }

      const [updated] = await context.db
        .update(file)
        .set({
          checksum: metadata.etag ?? null,
          size: metadata.size,
          status: "ready",
          ...(metadata.contentType
            ? { contentType: metadata.contentType }
            : {}),
        })
        .where(eq(file.id, row.id))
        .returning();

      return updated;
    }),

  /**
   * The row exists before the bytes do, so an abandoned upload is a visible
   * `pending` row.
   */
  createUpload: orgMutationProcedure
    .use(requirePermission({ file: ["create"] }))
    .input(createUploadInput)
    .handler(async ({ context, input }) => {
      // Sanitized, not raw: `name` is echoed back in the download's
      // Content-Disposition, so it must not carry a traversal attempt back out.
      const name = sanitizeFileName(input.name);

      const key = buildObjectKey({
        name,
        objectId: crypto.randomUUID(),
        organizationId: context.organizationId,
      });

      const [row] = await context.db
        .insert(file)
        .values({
          bucket: storage.bucket,
          contentType: input.contentType,
          key,
          name,
          organizationId: context.organizationId,
          status: "pending",
          userId: context.session.user.id,
        })
        .returning();

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create file record",
        });
      }

      // Local HMAC, no network call — safe inside the surrounding transaction.
      const uploadUrl = await storage.presignUpload({
        contentLength: input.size,
        contentType: input.contentType,
        key,
      });

      return { fileId: row.id, key, uploadUrl };
    }),

  deleteFile: orgMutationProcedure
    .use(requirePermission({ file: ["delete"] }))
    .input(fileIdInput)
    .handler(({ context, input }) =>
      deleteHouseholdFile(context, input.fileId)
    ),

  getDownloadUrl: orgProcedure
    .use(requirePermission({ file: ["read"] }))
    .input(fileIdInput)
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select()
        .from(file)
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.organizationId, context.organizationId)
          )
        )
        .limit(1);

      if (!row) {
        throw fileNotFound();
      }

      return presignFileDownload(row);
    }),

  listFiles: orgProcedure
    .use(requirePermission({ file: ["read"] }))
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(50) })
        .optional()
    )
    .handler(({ context, input }) =>
      // uuidv7 ids sort chronologically, so newest-first needs no extra index.
      context.db
        .select()
        .from(file)
        .where(eq(file.organizationId, context.organizationId))
        .orderBy(desc(file.id))
        .limit(input?.limit ?? 50)
    ),
};
