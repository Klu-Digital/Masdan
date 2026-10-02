import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requirePermission,
} from "../procedures";
import { parseQuickEntryText, quickEntryText } from "./quick-entry.parse";
import {
  transactionFilterValues,
  transactionListValues,
  transactionSummaryValues,
  transactionUpdateValues,
  transactionValues,
} from "./schema";
import { bulkUpdateTransactions, bulkUpdateValues } from "./transactions.bulk";
import {
  addTransaction,
  setTransactionArchived,
  updateTransaction,
} from "./transactions.commands";
import {
  getTransaction,
  listTransactions,
  transactionSummary,
  transactionTotals,
} from "./transactions.queries";

const transactionIdInput = z.object({ transactionId: z.uuid() });

export const transactionsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ transaction: ["archive"] }))
    .input(transactionIdInput)
    .handler(({ context, input }) =>
      setTransactionArchived(
        context.db,
        context.organizationId,
        input.transactionId,
        new Date()
      )
    ),

  bulkUpdate: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(bulkUpdateValues)
    .handler(({ context, input }) =>
      bulkUpdateTransactions(context.db, context.organizationId, input)
    ),

  create: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(transactionValues)
    .handler(({ context, input }) =>
      addTransaction(
        context.db,
        context.organizationId,
        input,
        context.session.user.id
      )
    ),

  get: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionIdInput)
    .handler(({ context, input }) =>
      getTransaction(context.db, context.organizationId, input.transactionId)
    ),

  list: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionListValues)
    .handler(({ context, input }) =>
      listTransactions(context.db, context.organizationId, input)
    ),

  // Any AI failure leaves `input` null; the client falls back to the form.
  parseQuickEntry: orgProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .use(rateLimit({ limit: 30, window: 60 }))
    .input(z.object({ text: quickEntryText }))
    .handler(({ context, input }) =>
      parseQuickEntryText(
        context.db,
        context.organizationId,
        context.session.user.id,
        input.text
      )
    ),

  restore: orgMutationProcedure
    .use(requirePermission({ transaction: ["restore"] }))
    .input(transactionIdInput)
    .handler(({ context, input }) =>
      setTransactionArchived(
        context.db,
        context.organizationId,
        input.transactionId,
        null
      )
    ),

  summary: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionSummaryValues)
    .handler(({ context, input }) =>
      transactionSummary(context.db, context.organizationId, input)
    ),

  totals: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(transactionFilterValues)
    .handler(({ context, input }) =>
      transactionTotals(context.db, context.organizationId, input)
    ),

  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transactionUpdateValues)
    .handler(({ context, input }) =>
      updateTransaction(context.db, context.organizationId, input)
    ),
};
