import {
  file,
  financialAccount,
  transactionImport,
  transactionImportRow,
  transactionImportRowStatuses,
} from "@masdan/db/schema/index";
import type { TransactionImportStatus } from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import {
  activeAccount,
  validCategory,
} from "../transactions/transactions.write";
import { OPENING_BALANCE_MODES, importMappingSchema } from "./mapping";

const CSV_CONTENT_TYPES = new Set(["text/csv", "text/plain"]);

const importConfigValues = z
  .object({
    accountId: z.uuid(),
    defaultExpenseCategoryId: z.uuid(),
    defaultIncomeCategoryId: z.uuid(),
    mapping: importMappingSchema,
    openingBalanceMode: z.enum(OPENING_BALANCE_MODES),
  })
  .strict();

type ImportConfig = z.output<typeof importConfigValues>;

const importIdInput = z.object({ importId: z.uuid() });

const importFields = {
  accountId: transactionImport.accountId,
  accountName: financialAccount.name,
  checksum: transactionImport.checksum,
  committedAt: transactionImport.committedAt,
  createdAt: transactionImport.createdAt,
  currencyCode: financialAccount.currencyCode,
  defaultExpenseCategoryId: transactionImport.defaultExpenseCategoryId,
  defaultIncomeCategoryId: transactionImport.defaultIncomeCategoryId,
  duplicateRows: transactionImport.duplicateRows,
  error: transactionImport.error,
  failedStatus: transactionImport.failedStatus,
  fileName: transactionImport.fileName,
  headers: transactionImport.headers,
  id: transactionImport.id,
  importedRows: transactionImport.importedRows,
  invalidRows: transactionImport.invalidRows,
  mapping: transactionImport.mapping,
  openingBalanceDate: financialAccount.openingBalanceDate,
  openingBalanceMode: transactionImport.openingBalanceMode,
  sourceFileId: transactionImport.sourceFileId,
  status: transactionImport.status,
  totalRows: transactionImport.totalRows,
  updatedAt: transactionImport.updatedAt,
  validRows: transactionImport.validRows,
  validatedAt: transactionImport.validatedAt,
};

type Db = Context["db"];

const importNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Import not found" });

const findImport = async (db: Db, organizationId: string, importId: string) => {
  const [row] = await db
    .select(importFields)
    .from(transactionImport)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, transactionImport.accountId)
    )
    .where(
      and(
        eq(transactionImport.id, importId),
        eq(transactionImport.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) {
    throw importNotFound();
  }
  return { ...row, mapping: importMappingSchema.parse(row.mapping) };
};

/** Every id must belong to the caller's household; lookups filter on it. */
const assertConfig = async (
  db: Db,
  organizationId: string,
  config: ImportConfig
): Promise<void> => {
  await activeAccount(db, organizationId, config.accountId);
  const [expense, income] = await Promise.all([
    validCategory(db, organizationId, config.defaultExpenseCategoryId, false),
    validCategory(db, organizationId, config.defaultIncomeCategoryId, false),
  ]);
  if (expense.type !== "expense") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an expense category for money out",
    });
  }
  if (income.type !== "income") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an income category for money in",
    });
  }
};

/** On the status change's transaction: neither lands without the other. */
const enqueueProcessing = (db: Db, importId: string) =>
  queue.enqueue("imports.process", { importId }, { tx: db });

const transition = async (
  db: Db,
  organizationId: string,
  importId: string,
  from: TransactionImportStatus[],
  values: Partial<typeof transactionImport.$inferInsert>
) => {
  const [updated] = await db
    .update(transactionImport)
    .set(values)
    .where(
      and(
        eq(transactionImport.id, importId),
        eq(transactionImport.organizationId, organizationId),
        inArray(transactionImport.status, from)
      )
    )
    .returning({ id: transactionImport.id });
  if (!updated) {
    await findImport(db, organizationId, importId);
    throw new ORPCError("CONFLICT", {
      message: "This import can't do that in its current state",
    });
  }
};

export const importsRouter = {
  commit: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      if (current.status === "ready" && current.validRows === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "There are no valid rows to import",
        });
      }
      await transition(
        context.db,
        context.organizationId,
        input.importId,
        ["ready"],
        { status: "committing" }
      );
      await enqueueProcessing(context.db, input.importId);
      return findImport(context.db, context.organizationId, input.importId);
    }),

  create: orgMutationProcedure
    .use(requirePermission({ file: ["create"], transaction: ["create"] }))
    .input(importConfigValues.extend({ fileId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [source] = await context.db
        .select({
          contentType: file.contentType,
          id: file.id,
          name: file.name,
          status: file.status,
        })
        .from(file)
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.organizationId, context.organizationId)
          )
        )
        .limit(1);
      if (!source) {
        throw new ORPCError("NOT_FOUND", { message: "File not found" });
      }
      if (source.status !== "ready") {
        throw new ORPCError("CONFLICT", {
          message: "File upload is not complete",
        });
      }
      if (!CSV_CONTENT_TYPES.has(source.contentType)) {
        throw new ORPCError("BAD_REQUEST", { message: "Upload a CSV file" });
      }
      const { fileId, ...config } = input;
      await assertConfig(context.db, context.organizationId, config);

      const [created] = await context.db
        .insert(transactionImport)
        .values({
          ...config,
          createdByUserId: context.session.user.id,
          fileName: source.name,
          organizationId: context.organizationId,
          sourceFileId: fileId,
          status: "validating",
        })
        .returning({ id: transactionImport.id });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create import",
        });
      }
      await enqueueProcessing(context.db, created.id);
      return findImport(context.db, context.organizationId, created.id);
    }),

  discard: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      await transition(
        context.db,
        context.organizationId,
        input.importId,
        ["ready", "failed"],
        { status: "discarded" }
      );
      return findImport(context.db, context.organizationId, input.importId);
    }),

  get: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      const [previous] = current.checksum
        ? await context.db
            .select({
              committedAt: transactionImport.committedAt,
              id: transactionImport.id,
            })
            .from(transactionImport)
            .where(
              and(
                eq(transactionImport.organizationId, context.organizationId),
                eq(transactionImport.accountId, current.accountId),
                eq(transactionImport.checksum, current.checksum),
                eq(transactionImport.status, "completed"),
                ne(transactionImport.id, current.id)
              )
            )
            .orderBy(desc(transactionImport.id))
            .limit(1)
        : [];
      return { ...current, previousImport: previous ?? null };
    }),

  list: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(
      z
        .object({
          accountId: z.uuid().optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .default({ limit: 20 })
    )
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .select(importFields)
        .from(transactionImport)
        .innerJoin(
          financialAccount,
          eq(financialAccount.id, transactionImport.accountId)
        )
        .where(
          and(
            eq(transactionImport.organizationId, context.organizationId),
            input.accountId
              ? eq(transactionImport.accountId, input.accountId)
              : undefined
          )
        )
        .orderBy(desc(transactionImport.id))
        .limit(input.limit);
      return rows.map((row) => ({
        ...row,
        mapping: importMappingSchema.parse(row.mapping),
      }));
    }),

  retry: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importIdInput)
    .handler(async ({ context, input }) => {
      const current = await findImport(
        context.db,
        context.organizationId,
        input.importId
      );
      await transition(
        context.db,
        context.organizationId,
        input.importId,
        ["failed"],
        {
          error: null,
          failedStatus: null,
          status: current.failedStatus ?? "validating",
        }
      );
      await enqueueProcessing(context.db, input.importId);
      return findImport(context.db, context.organizationId, input.importId);
    }),

  rows: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(
      importIdInput.extend({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        statuses: z
          .array(z.enum(transactionImportRowStatuses))
          .max(4)
          .default([]),
      })
    )
    .handler(async ({ context, input }) => {
      await findImport(context.db, context.organizationId, input.importId);
      const conditions = and(
        eq(transactionImportRow.importId, input.importId),
        eq(transactionImportRow.organizationId, context.organizationId),
        input.statuses.length > 0
          ? inArray(transactionImportRow.status, input.statuses)
          : undefined
      );
      const [items, totals] = await Promise.all([
        context.db
          .select({
            amount: transactionImportRow.amount,
            categoryId: transactionImportRow.categoryId,
            description: transactionImportRow.description,
            errors: transactionImportRow.errors,
            id: transactionImportRow.id,
            notes: transactionImportRow.notes,
            raw: transactionImportRow.raw,
            rowNumber: transactionImportRow.rowNumber,
            status: transactionImportRow.status,
            transactionDate: transactionImportRow.transactionDate,
            transactionId: transactionImportRow.transactionId,
            type: transactionImportRow.type,
          })
          .from(transactionImportRow)
          .where(conditions)
          .orderBy(asc(transactionImportRow.rowNumber))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db
          .select({ total: count() })
          .from(transactionImportRow)
          .where(conditions),
      ]);
      const total = totals[0]?.total ?? 0;
      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(importConfigValues.extend({ importId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { importId, ...config } = input;
      await assertConfig(context.db, context.organizationId, config);
      await transition(
        context.db,
        context.organizationId,
        importId,
        ["ready", "failed"],
        {
          ...config,
          duplicateRows: 0,
          error: null,
          failedStatus: null,
          importedRows: 0,
          invalidRows: 0,
          status: "validating",
          totalRows: 0,
          validRows: 0,
        }
      );
      await enqueueProcessing(context.db, importId);
      return findImport(context.db, context.organizationId, importId);
    }),
};
