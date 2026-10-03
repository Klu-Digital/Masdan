import type { RouterInputs } from "@/utils/orpc";

import { accountOf, transferView } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Transaction, Transfer } from "../store";
import { badRequest, find, newId, notFound, scaled, text } from "../util";

type TransferValues = RouterInputs["transfers"]["create"];

const activeAccount = (accountId: string) => {
  const account = accountOf(accountId);
  if (!account || account.archivedAt !== null) {
    throw notFound("Financial account");
  }
  return account;
};

// Both postings follow the transfer, so balances stay derived from the ledger.
const writePostings = (transfer: Transfer): void => {
  const now = new Date();
  const existing = db().transactions.filter(
    (row) => row.transferId === transfer.id
  );
  db().transactions = db().transactions.filter(
    (row) => row.transferId !== transfer.id
  );
  for (const side of ["source", "destination"] as const) {
    const account = activeAccount(
      side === "source"
        ? transfer.sourceAccountId
        : transfer.destinationAccountId
    );
    const previous = existing.find((row) => row.transferSide === side);
    const posting: Transaction = {
      accountId: account.id,
      adjustmentDirection: null,
      amount:
        side === "source" ? transfer.sourceAmount : transfer.destinationAmount,
      archivedAt: null,
      categoryId: null,
      createdAt: previous?.createdAt ?? now,
      createdByUserId: db().user.id,
      currencyCode: account.currencyCode,
      id: previous?.id ?? newId(),
      notes: transfer.notes,
      organizationId: transfer.organizationId,
      paidStatus: "paid",
      reconciliationSnapshotId: null,
      recurringOccurrenceDate: null,
      recurringScheduleId: null,
      ruleApplication: null,
      splits: [],
      suggestionApplication: null,
      tagIds: previous?.tagIds ?? [],
      transactionDate: transfer.transactionDate,
      transferId: transfer.id,
      transferSide: side,
      updatedAt: now,
    };
    db().transactions.push(posting);
  }
};

const transferValues = (input: TransferValues) => {
  if (input.sourceAccountId === input.destinationAccountId) {
    throw badRequest("Choose two different accounts");
  }
  return {
    destinationAccountId: input.destinationAccountId,
    destinationAmount: text(scaled(input.destinationAmount)),
    notes: input.notes ?? null,
    sourceAccountId: input.sourceAccountId,
    sourceAmount: text(scaled(input.sourceAmount)),
    transactionDate: input.transactionDate,
  };
};

export const transfers: Section<"transfers"> = {
  create: (input) => {
    const now = new Date();
    const transfer: Transfer = {
      ...transferValues(input),
      createdAt: now,
      id: newId(),
      organizationId: db().household.id,
      updatedAt: now,
    };
    db().transfers.push(transfer);
    writePostings(transfer);
    return transferView(transfer);
  },

  delete: ({ transferId }) => {
    find(db().transfers, transferId, "Transfer");
    db().transfers = db().transfers.filter((row) => row.id !== transferId);
    db().transactions = db().transactions.filter(
      (row) => row.transferId !== transferId
    );
    return { id: transferId };
  },

  update: ({ transferId, ...input }) => {
    const transfer = find(db().transfers, transferId, "Transfer");
    Object.assign(transfer, transferValues(input), { updatedAt: new Date() });
    writePostings(transfer);
    return transferView(transfer);
  },
};
