import {
  file,
  fileStatuses,
  organization,
  user,
} from "@masdan/db/schema/index";
import { isStorageConfigured, storage } from "@masdan/storage";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { adminMutationProcedure, adminProcedure } from "../procedures";
import { notFound } from "../shared/errors";

const HOURS_TO_MS = 60 * 60 * 1000;

// Platform surface: deliberately ignores `organizationId`.
export const filesPlatformRouter = {
  deleteFile: adminMutationProcedure
    .input(z.object({ fileId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .delete(file)
        .where(eq(file.id, input.fileId))
        .returning();

      if (!row) {
        throw notFound("File");
      }

      context.log?.info("admin.files.delete", {
        action: "admin.files.delete",
        actorId: context.session.user.id,
        fileId: row.id,
      });

      // After the row write: the transaction can still roll back, and an
      // orphaned object is recoverable in a way a deleted one is not.
      if (isStorageConfigured()) {
        await storage.deleteObject({ key: row.key });
      }

      return { fileId: row.id };
    }),

  downloadUrl: adminProcedure
    .input(z.object({ fileId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select()
        .from(file)
        .where(eq(file.id, input.fileId));

      if (!row) {
        throw notFound("File");
      }

      if (row.status !== "ready") {
        throw new ORPCError("CONFLICT", {
          message: "File upload is not complete",
        });
      }

      if (!isStorageConfigured()) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "Storage is not configured in this environment",
        });
      }

      const downloadUrl = await storage.presignDownload({
        downloadFileName: row.name,
        key: row.key,
      });

      return { downloadUrl };
    }),

  list: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        organizationId: z.uuid().optional(),
        status: z.enum(fileStatuses).optional(),
        userId: z.uuid().optional(),
      })
    )
    .handler(({ context, input }) => {
      const conditions = [
        input.status ? eq(file.status, input.status) : undefined,
        input.organizationId
          ? eq(file.organizationId, input.organizationId)
          : undefined,
        input.userId ? eq(file.userId, input.userId) : undefined,
      ].filter((condition) => condition !== undefined);

      return (
        context.db
          .select({
            bucket: file.bucket,
            checksum: file.checksum,
            contentType: file.contentType,
            createdAt: file.createdAt,
            id: file.id,
            key: file.key,
            name: file.name,
            organizationId: file.organizationId,
            organizationName: organization.name,
            size: file.size,
            status: file.status,
            updatedAt: file.updatedAt,
            userEmail: user.email,
            userId: file.userId,
          })
          .from(file)
          .innerJoin(organization, eq(organization.id, file.organizationId))
          .innerJoin(user, eq(user.id, file.userId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          // uuidv7 ids sort chronologically, same as the org-scoped router — no
          // extra index needed for newest-first.
          .orderBy(desc(file.id))
          .limit(input.limit)
          .offset(input.offset)
      );
    }),

  pendingOlderThan: adminProcedure
    .input(z.object({ hours: z.number().int().positive().default(24) }))
    .handler(({ context, input }) => {
      const cutoff = new Date(Date.now() - input.hours * HOURS_TO_MS);

      return context.db
        .select({
          createdAt: file.createdAt,
          id: file.id,
          name: file.name,
          organizationId: file.organizationId,
          organizationName: organization.name,
          userEmail: user.email,
        })
        .from(file)
        .innerJoin(organization, eq(organization.id, file.organizationId))
        .innerJoin(user, eq(user.id, file.userId))
        .where(and(eq(file.status, "pending"), lt(file.createdAt, cutoff)))
        .orderBy(desc(file.id));
    }),
};
