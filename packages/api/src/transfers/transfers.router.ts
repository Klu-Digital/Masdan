import type { Database } from "@masdan/db";
import {
  financialAccount,
  financialTransaction,
  financialTransfer,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";

const isoDate = z.iso.date();
const positiveDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;
const SCALE_FACTOR = 1_000_000n;

const positiveAmount = z
  .string()
  .trim()
  .regex(positiveDecimalPattern, "Use a positive amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

const scaledAmount = (value: string): bigint => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(6, "0"));
};

const transferValues = z
  .object({
    destinationAccountId: z.uuid(),
    destinationAmount: positiveAmount,
    notes: z.string().trim().max(2000).nullable().optional(),
    sourceAccountId: z.uuid(),
    sourceAmount: positiveAmount,
    transactionDate: isoDate,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceAccountId === value.destinationAccountId) {
      context.addIssue({
        code: "custom",
        message: "Choose two different accounts",
        path: ["destinationAccountId"],
      });
    }
  });

const transferFields = {
  createdAt: financialTransfer.createdAt,
  destinationAccountId: financialTransfer.destinationAccountId,
  destinationAmount: financialTransfer.destinationAmount,
  id: financialTransfer.id,
  notes: financialTransfer.notes,
  organizationId: financialTransfer.organizationId,
  sourceAccountId: financialTransfer.sourceAccountId,
  sourceAmount: financialTransfer.sourceAmount,
  transactionDate: financialTransfer.transactionDate,
  updatedAt: financialTransfer.updatedAt,
};

type TransferValues = z.output<typeof transferValues>;

interface TransferAccount {
  accountClass: string;
  currencyCode: string;
  id: string;
  name: string;
}

const transferNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Transfer not found" });

const selectTransferAccounts = async (
  db: Database,
  organizationId: string,
  input: Pick<
    TransferValues,
    | "destinationAccountId"
    | "destinationAmount"
    | "sourceAccountId"
    | "sourceAmount"
  >
): Promise<{ destination: TransferAccount; source: TransferAccount }> => {
  const accounts = await db
    .select({
      accountClass: financialAccount.accountClass,
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
      name: financialAccount.name,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        inArray(financialAccount.id, [
          input.sourceAccountId,
          input.destinationAccountId,
        ]),
        isNull(financialAccount.archivedAt)
      )
    );

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const source = byId.get(input.sourceAccountId);
  const destination = byId.get(input.destinationAccountId);
  if (!source || !destination) {
    throw new ORPCError("NOT_FOUND", {
      message: "Financial account not found",
    });
  }

  if (
    source.currencyCode === destination.currencyCode &&
    scaledAmount(input.sourceAmount) !== scaledAmount(input.destinationAmount)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Same-currency transfers must use matching amounts",
    });
  }

  return { destination, source };
};

export const getTransfer = async (
  db: Database,
  organizationId: string,
  transferId: string
) => {
  const [transfer] = await db
    .select(transferFields)
    .from(financialTransfer)
    .where(
      and(
        eq(financialTransfer.id, transferId),
        eq(financialTransfer.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!transfer) {
    throw transferNotFound();
  }

  const accounts = await db
    .select({
      accountClass: financialAccount.accountClass,
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
      name: financialAccount.name,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.organizationId, organizationId),
        inArray(financialAccount.id, [
          transfer.sourceAccountId,
          transfer.destinationAccountId,
        ])
      )
    );
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const sourceAccount = accountById.get(transfer.sourceAccountId);
  const destinationAccount = accountById.get(transfer.destinationAccountId);
  if (!sourceAccount || !destinationAccount) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Transfer accounts are unavailable",
    });
  }

  return { ...transfer, destinationAccount, sourceAccount };
};

const writePostings = async (
  db: Database,
  organizationId: string,
  transferId: string,
  values: TransferValues,
  accounts: { destination: TransferAccount; source: TransferAccount }
): Promise<void> => {
  const [sourcePosting, destinationPosting] = await Promise.all([
    db
      .update(financialTransaction)
      .set({
        accountId: accounts.source.id,
        amount: values.sourceAmount,
        currencyCode: accounts.source.currencyCode,
        notes: values.notes ?? null,
        transactionDate: values.transactionDate,
      })
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          eq(financialTransaction.transferId, transferId),
          eq(financialTransaction.transferSide, "source")
        )
      )
      .returning({ id: financialTransaction.id }),
    db
      .update(financialTransaction)
      .set({
        accountId: accounts.destination.id,
        amount: values.destinationAmount,
        currencyCode: accounts.destination.currencyCode,
        notes: values.notes ?? null,
        transactionDate: values.transactionDate,
      })
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          eq(financialTransaction.transferId, transferId),
          eq(financialTransaction.transferSide, "destination")
        )
      )
      .returning({ id: financialTransaction.id }),
  ]);

  if (!sourcePosting[0] || !destinationPosting[0]) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Transfer postings are incomplete",
    });
  }
};

export const transfersRouter = {
  create: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(transferValues)
    .handler(async ({ context, input }) => {
      const accounts = await selectTransferAccounts(
        context.db,
        context.organizationId,
        input
      );
      const [created] = await context.db
        .insert(financialTransfer)
        .values({
          destinationAccountId: accounts.destination.id,
          destinationAmount: input.destinationAmount,
          notes: input.notes ?? null,
          organizationId: context.organizationId,
          sourceAccountId: accounts.source.id,
          sourceAmount: input.sourceAmount,
          transactionDate: input.transactionDate,
        })
        .returning(transferFields);

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create transfer",
        });
      }

      await context.db.insert(financialTransaction).values([
        {
          accountId: accounts.source.id,
          amount: input.sourceAmount,
          categoryId: null,
          currencyCode: accounts.source.currencyCode,
          notes: input.notes ?? null,
          organizationId: context.organizationId,
          paidStatus: "paid",
          transactionDate: input.transactionDate,
          transferId: created.id,
          transferSide: "source",
        },
        {
          accountId: accounts.destination.id,
          amount: input.destinationAmount,
          categoryId: null,
          currencyCode: accounts.destination.currencyCode,
          notes: input.notes ?? null,
          organizationId: context.organizationId,
          paidStatus: "paid",
          transactionDate: input.transactionDate,
          transferId: created.id,
          transferSide: "destination",
        },
      ]);

      return getTransfer(context.db, context.organizationId, created.id);
    }),

  delete: orgMutationProcedure
    .use(requirePermission({ transaction: ["archive"] }))
    .input(z.object({ transferId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [deleted] = await context.db
        .delete(financialTransfer)
        .where(
          and(
            eq(financialTransfer.id, input.transferId),
            eq(financialTransfer.organizationId, context.organizationId)
          )
        )
        .returning({ id: financialTransfer.id });

      if (!deleted) {
        throw transferNotFound();
      }

      return deleted;
    }),

  get: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(z.object({ transferId: z.uuid() }))
    .handler(({ context, input }) =>
      getTransfer(context.db, context.organizationId, input.transferId)
    ),

  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transferValues.extend({ transferId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const accounts = await selectTransferAccounts(
        context.db,
        context.organizationId,
        input
      );
      const [updated] = await context.db
        .update(financialTransfer)
        .set({
          destinationAccountId: accounts.destination.id,
          destinationAmount: input.destinationAmount,
          notes: input.notes ?? null,
          sourceAccountId: accounts.source.id,
          sourceAmount: input.sourceAmount,
          transactionDate: input.transactionDate,
        })
        .where(
          and(
            eq(financialTransfer.id, input.transferId),
            eq(financialTransfer.organizationId, context.organizationId)
          )
        )
        .returning(transferFields);

      if (!updated) {
        throw transferNotFound();
      }

      await writePostings(
        context.db,
        context.organizationId,
        updated.id,
        input,
        accounts
      );
      return getTransfer(context.db, context.organizationId, updated.id);
    }),
};
