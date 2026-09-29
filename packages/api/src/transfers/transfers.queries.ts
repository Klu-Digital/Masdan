import type { Database } from "@masdan/db";
import { financialAccount, financialTransfer } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

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
    throw notFound("Transfer");
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
