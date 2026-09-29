import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import {
  createAccount,
  createStatement,
  saveSnapshot,
  setAccountArchived,
  updateAccount,
} from "./accounts.commands";
import {
  getAccount,
  listAccounts,
  listSnapshots,
  listStatements,
} from "./accounts.queries";
import { accountValues, snapshotValues, statementValues } from "./schema";

const accountIdInput = z.object({ accountId: z.uuid() });

export const accountsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["archive"] }))
    .input(accountIdInput)
    .handler(({ context, input }) =>
      setAccountArchived(
        context.db,
        context.organizationId,
        input.accountId,
        new Date()
      )
    ),

  create: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["create"] }))
    .input(accountValues)
    .handler(({ context, input }) =>
      createAccount(context.db, context.organizationId, input)
    ),

  createStatement: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(statementValues)
    .handler(({ context, input }) =>
      createStatement(context.db, context.organizationId, input)
    ),

  get: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(({ context, input }) =>
      getAccount(context.db, context.organizationId, input.accountId)
    ),

  list: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .handler(({ context, input }) =>
      listAccounts(
        context.db,
        context.organizationId,
        input?.includeArchived ?? false
      )
    ),

  listSnapshots: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(({ context, input }) =>
      listSnapshots(context.db, context.organizationId, input.accountId)
    ),

  listStatements: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(({ context, input }) =>
      listStatements(context.db, context.organizationId, input.accountId)
    ),

  restore: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["restore"] }))
    .input(accountIdInput)
    .handler(({ context, input }) =>
      setAccountArchived(
        context.db,
        context.organizationId,
        input.accountId,
        null
      )
    ),

  saveSnapshot: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(snapshotValues)
    .handler(({ context, input }) =>
      saveSnapshot(context.db, context.organizationId, input)
    ),

  update: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(accountValues.extend({ accountId: z.uuid() }))
    .handler(({ context, input }) =>
      updateAccount(context.db, context.organizationId, input)
    ),
};
