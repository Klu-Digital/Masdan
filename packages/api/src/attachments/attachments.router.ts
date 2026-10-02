import type { Database } from "@masdan/db";
import {
  file,
  financialTransaction,
  financialTransactionAttachment,
  transactionImport,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  deleteHouseholdFile,
  presignFileDownload,
} from "../files/files.operations";
import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { notFound } from "../shared/errors";

export const MAX_ATTACHMENTS_PER_TRANSACTION = 20;

const transactionIdInput = z.object({ transactionId: z.uuid() });
const attachmentInput = transactionIdInput.extend({ fileId: z.uuid() });

const attachmentFields = {
  contentType: file.contentType,
  createdAt: financialTransactionAttachment.createdAt,
  id: file.id,
  name: file.name,
  size: file.size,
  status: file.status,
  transactionId: financialTransactionAttachment.transactionId,
  userId: file.userId,
};

// Locked so an attach cannot race an archive or slip past the cap.
const householdTransaction = async (
  db: Database,
  organizationId: string,
  transactionId: string,
  { lock = false }: { lock?: boolean } = {}
) => {
  const query = db
    .select({
      archivedAt: financialTransaction.archivedAt,
      id: financialTransaction.id,
      transferId: financialTransaction.transferId,
    })
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.id, transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);
  const [row] = await (lock ? query.for("update") : query);

  if (!row) {
    throw notFound("Transaction");
  }
  return row;
};

/** Attachments are part of the entry, so they follow `transactions.update`'s rules. */
const assertEditable = (transaction: {
  archivedAt: Date | null;
  transferId: string | null;
}): void => {
  if (transaction.transferId !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Transfers can't have attachments",
    });
  }
  if (transaction.archivedAt !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Restore the transaction before changing its attachments",
    });
  }
};

/** Both sides filter on the household, so a foreign id reads as missing. */
const findAttachment = async (
  db: Database,
  organizationId: string,
  input: { fileId: string; transactionId: string }
) => {
  const [row] = await db
    .select({ ...attachmentFields, key: file.key })
    .from(financialTransactionAttachment)
    .innerJoin(file, eq(file.id, financialTransactionAttachment.fileId))
    .innerJoin(
      financialTransaction,
      eq(financialTransaction.id, financialTransactionAttachment.transactionId)
    )
    .where(
      and(
        eq(financialTransactionAttachment.transactionId, input.transactionId),
        eq(financialTransactionAttachment.fileId, input.fileId),
        eq(file.organizationId, organizationId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    throw notFound("Attachment");
  }
  return row;
};

export const attachmentsRouter = {
  attach: orgMutationProcedure
    .use(requirePermission({ attachment: ["create"], transaction: ["update"] }))
    .input(attachmentInput)
    .handler(async ({ context, input }) => {
      const transaction = await householdTransaction(
        context.db,
        context.organizationId,
        input.transactionId,
        { lock: true }
      );
      assertEditable(transaction);

      const [source] = await context.db
        .select({ id: file.id, status: file.status })
        .from(file)
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.organizationId, context.organizationId)
          )
        )
        .limit(1);
      if (!source) {
        throw notFound("File");
      }
      if (source.status !== "ready") {
        throw new ORPCError("CONFLICT", {
          message: "File upload is not complete",
        });
      }

      // Removal deletes the file, which would pull an import's source out from under it.
      const [importSource] = await context.db
        .select({ id: transactionImport.id })
        .from(transactionImport)
        .where(eq(transactionImport.sourceFileId, source.id))
        .limit(1);
      if (importSource) {
        throw new ORPCError("CONFLICT", {
          message: "This file is already in use",
        });
      }

      const [existing] = await context.db
        .select({ total: count() })
        .from(financialTransactionAttachment)
        .where(
          eq(financialTransactionAttachment.transactionId, transaction.id)
        );
      if ((existing?.total ?? 0) >= MAX_ATTACHMENTS_PER_TRANSACTION) {
        throw new ORPCError("BAD_REQUEST", {
          message: `A transaction can have at most ${MAX_ATTACHMENTS_PER_TRANSACTION} attachments`,
        });
      }

      const [linked] = await context.db
        .insert(financialTransactionAttachment)
        .values({
          fileId: source.id,
          organizationId: context.organizationId,
          transactionId: transaction.id,
        })
        .onConflictDoNothing()
        .returning({ fileId: financialTransactionAttachment.fileId });
      if (!linked) {
        throw new ORPCError("CONFLICT", {
          message: "This file is already attached to a transaction",
        });
      }

      const { key: _key, ...attachment } = await findAttachment(
        context.db,
        context.organizationId,
        input
      );
      return attachment;
    }),

  downloadUrl: orgProcedure
    .use(requirePermission({ attachment: ["read"], transaction: ["read"] }))
    .input(attachmentInput)
    .handler(async ({ context, input }) =>
      presignFileDownload(
        await findAttachment(context.db, context.organizationId, input)
      )
    ),

  list: orgProcedure
    .use(requirePermission({ attachment: ["read"], transaction: ["read"] }))
    .input(transactionIdInput)
    .handler(async ({ context, input }) => {
      const transaction = await householdTransaction(
        context.db,
        context.organizationId,
        input.transactionId
      );

      return context.db
        .select(attachmentFields)
        .from(financialTransactionAttachment)
        .innerJoin(file, eq(file.id, financialTransactionAttachment.fileId))
        .where(
          and(
            eq(financialTransactionAttachment.transactionId, transaction.id),
            eq(file.organizationId, context.organizationId)
          )
        )
        .orderBy(asc(financialTransactionAttachment.createdAt), asc(file.id));
    }),

  remove: orgMutationProcedure
    .use(requirePermission({ attachment: ["delete"], transaction: ["update"] }))
    .input(attachmentInput)
    .handler(async ({ context, input }) => {
      const transaction = await householdTransaction(
        context.db,
        context.organizationId,
        input.transactionId,
        { lock: true }
      );
      assertEditable(transaction);
      await findAttachment(context.db, context.organizationId, input);

      // The link cascades with the file row, so no attachment can outlive its file.
      return deleteHouseholdFile(context, input.fileId);
    }),
};
