import type { Database } from "@masdan/db";
import { financialAccount, financialTransfer } from "@masdan/db/schema/index";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { notFound } from "../shared/errors";

export const transferFields = {
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

const sourceAccount = alias(financialAccount, "source_account");
const destinationAccount = alias(financialAccount, "destination_account");

const transferAccountFields = (
  account: typeof sourceAccount | typeof destinationAccount
) => ({
  accountClass: account.accountClass,
  currencyCode: account.currencyCode,
  id: account.id,
  name: account.name,
});

/** Transfers with both accounts, in one query however many are asked for. */
export const listTransfers = async (
  db: Database,
  organizationId: string,
  transferIds: string[]
) => {
  if (transferIds.length === 0) {
    return [];
  }

  return await db
    .select({
      ...transferFields,
      destinationAccount: transferAccountFields(destinationAccount),
      sourceAccount: transferAccountFields(sourceAccount),
    })
    .from(financialTransfer)
    .innerJoin(
      sourceAccount,
      and(
        eq(sourceAccount.organizationId, financialTransfer.organizationId),
        eq(sourceAccount.id, financialTransfer.sourceAccountId)
      )
    )
    .innerJoin(
      destinationAccount,
      and(
        eq(destinationAccount.organizationId, financialTransfer.organizationId),
        eq(destinationAccount.id, financialTransfer.destinationAccountId)
      )
    )
    .where(
      and(
        eq(financialTransfer.organizationId, organizationId),
        inArray(financialTransfer.id, transferIds)
      )
    );
};

export const getTransfer = async (
  db: Database,
  organizationId: string,
  transferId: string
) => {
  const [transfer] = await listTransfers(db, organizationId, [transferId]);
  if (!transfer) {
    throw notFound("Transfer");
  }

  return transfer;
};
