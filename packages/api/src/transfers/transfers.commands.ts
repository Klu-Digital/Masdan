import type { Database } from "@masdan/db";
import {
  financialAccount,
  financialTransaction,
  financialTransfer,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { notFound } from "../shared/errors";
import { scaledAmount } from "../shared/money";
import { lockOwned } from "../shared/ownership";
import { lockLedgerAccounts } from "../transactions/transactions.write";
import { getTransfer, transferFields } from "./transfers.queries";

interface TransferValues {
  destinationAccountId: string;
  destinationAmount: string;
  sourceAccountId: string;
  sourceAmount: string;
  transactionDate: string;
  notes?: string | null;
}

const selectAccounts = async (
  db: Database,
  organizationId: string,
  input: TransferValues
) => {
  const accounts = await db
    .select({
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
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
    )
    .orderBy(financialAccount.id)
    .for("share");
  const source = accounts.find(
    (account) => account.id === input.sourceAccountId
  );
  const destination = accounts.find(
    (account) => account.id === input.destinationAccountId
  );
  if (!source || !destination) {
    throw notFound("Financial account");
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

const postingValues = (
  organizationId: string,
  transferId: string,
  input: TransferValues,
  accounts: Awaited<ReturnType<typeof selectAccounts>>
) =>
  [
    {
      accountId: accounts.source.id,
      amount: input.sourceAmount,
      currencyCode: accounts.source.currencyCode,
      transferSide: "source" as const,
    },
    {
      accountId: accounts.destination.id,
      amount: input.destinationAmount,
      currencyCode: accounts.destination.currencyCode,
      transferSide: "destination" as const,
    },
  ].map((posting) => ({
    ...posting,
    notes: input.notes ?? null,
    organizationId,
    transactionDate: input.transactionDate,
    transferId,
  }));

export const createTransfer = async (
  db: Database,
  organizationId: string,
  input: TransferValues,
  createdByUserId: string | null = null
) => {
  const accounts = await selectAccounts(db, organizationId, input);
  const [created] = await db
    .insert(financialTransfer)
    .values({ ...input, notes: input.notes ?? null, organizationId })
    .returning(transferFields);
  if (!created) {
    throw new ORPCError("INTERNAL_SERVER_ERROR");
  }
  await db
    .insert(financialTransaction)
    .values(
      postingValues(organizationId, created.id, input, accounts).map(
        (posting) => ({ ...posting, createdByUserId })
      )
    );
  return getTransfer(db, organizationId, created.id);
};

const lockTransfer = async (
  db: Database,
  organizationId: string,
  transferId: string
) => {
  const transfer = await lockOwned(
    db,
    financialTransfer,
    { id: transferId, organizationId },
    "Transfer"
  );
  await db
    .select({ id: financialTransaction.id })
    .from(financialTransaction)
    .where(
      and(
        eq(financialTransaction.organizationId, organizationId),
        eq(financialTransaction.transferId, transferId)
      )
    )
    .orderBy(financialTransaction.id)
    .for("update");
  return transfer;
};

export const updateTransfer = async (
  db: Database,
  organizationId: string,
  input: TransferValues & { transferId: string }
) => {
  const existing = await lockTransfer(db, organizationId, input.transferId);
  await lockLedgerAccounts(db, organizationId, [
    existing.sourceAccountId,
    existing.destinationAccountId,
    input.sourceAccountId,
    input.destinationAccountId,
  ]);
  const accounts = await selectAccounts(db, organizationId, input);
  const { transferId: _transferId, ...values } = input;
  await db
    .update(financialTransfer)
    .set({ ...values, notes: values.notes ?? null })
    .where(eq(financialTransfer.id, existing.id));
  for (const posting of postingValues(
    organizationId,
    existing.id,
    input,
    accounts
  )) {
    const [updated] = await db
      .update(financialTransaction)
      .set(posting)
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          eq(financialTransaction.transferId, existing.id),
          eq(financialTransaction.transferSide, posting.transferSide)
        )
      )
      .returning({ id: financialTransaction.id });
    if (!updated) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Transfer postings are incomplete",
      });
    }
  }
  return getTransfer(db, organizationId, existing.id);
};

export const deleteTransfer = async (
  db: Database,
  organizationId: string,
  transferId: string
) => {
  const existing = await lockTransfer(db, organizationId, transferId);
  await lockLedgerAccounts(db, organizationId, [
    existing.sourceAccountId,
    existing.destinationAccountId,
  ]);
  const [deleted] = await db
    .delete(financialTransfer)
    .where(
      and(
        eq(financialTransfer.id, transferId),
        eq(financialTransfer.organizationId, organizationId)
      )
    )
    .returning({ id: financialTransfer.id });
  if (!deleted) {
    throw notFound("Transfer");
  }
  return deleted;
};
