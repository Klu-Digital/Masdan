import type { RouterOutputs } from "@/utils/orpc";

import { db } from "./store";
import type { Account, Transaction, Transfer } from "./store";
import { find, scaled, text } from "./util";

type Outputs = RouterOutputs;
type AccountView = Outputs["accounts"]["list"][number];
type TransactionDetails = Outputs["transactions"]["archive"];
type TransactionRow = Outputs["transactions"]["create"];
type TransferView = Outputs["transfers"]["create"];

export const categoryOf = (categoryId: string | null) =>
  db().categories.find((row) => row.id === categoryId) ?? null;

export const accountOf = (accountId: string | null) =>
  db().accounts.find((row) => row.id === accountId) ?? null;

/** `postingDelta` in packages/api/src/accounts/balances.ts. */
export const postingDelta = (
  posting: Transaction,
  account: Account
): bigint => {
  const amount = scaled(posting.amount);
  if (posting.adjustmentDirection === "increase") {
    return amount;
  }
  if (posting.adjustmentDirection === "decrease") {
    return -amount;
  }
  const asset = account.accountClass === "asset";
  if (posting.transferSide === "source") {
    return asset ? -amount : amount;
  }
  if (posting.transferSide === "destination") {
    return asset ? amount : -amount;
  }
  const type = categoryOf(posting.categoryId)?.type;
  if (asset) {
    return type === "income" ? amount : -amount;
  }
  return type === "expense" ? amount : -amount;
};

/** The postings that count toward a balance, optionally up to a day. */
const balancePostings = (account: Account, asOf?: string): Transaction[] =>
  db().transactions.filter(
    (row) =>
      row.accountId === account.id &&
      row.archivedAt === null &&
      row.transactionDate >= account.openingBalanceDate &&
      (asOf === undefined || row.transactionDate <= asOf)
  );

export const balanceOf = (account: Account, asOf?: string): bigint => {
  let balance = scaled(account.openingBalance);
  for (const row of balancePostings(account, asOf)) {
    balance += postingDelta(row, account);
  }
  return balance;
};

/** `creditMetrics` in packages/api/src/accounts/accounts.queries.ts. */
const creditMetrics = (
  account: Account,
  balance: bigint
): { availableCredit: string | null; utilization: string | null } => {
  if (account.accountType !== "credit_card" || account.creditLimit === null) {
    return { availableCredit: null, utilization: null };
  }
  const limit = scaled(account.creditLimit);
  const availableCredit = text(limit - balance);
  if (limit <= 0n) {
    return { availableCredit, utilization: null };
  }
  const hundredths =
    ((balance > 0n ? balance : 0n) * 10_000n + limit / 2n) / limit;
  return {
    availableCredit,
    utilization: `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`,
  };
};

export const accountView = (account: Account): AccountView => {
  const balance = balanceOf(account);
  return {
    ...account,
    balance: text(balance),
    ...creditMetrics(account, balance),
  };
};

const accountSummary = (accountId: string) => {
  const account = find(db().accounts, accountId, "Financial account");
  return {
    accountClass: account.accountClass,
    currencyCode: account.currencyCode,
    id: account.id,
    name: account.name,
  };
};

export const transferView = (transfer: Transfer): TransferView => ({
  ...transfer,
  destinationAccount: accountSummary(transfer.destinationAccountId),
  sourceAccount: accountSummary(transfer.sourceAccountId),
});

export const transactionDetails = (
  posting: Transaction
): TransactionDetails => {
  const { splits, tagIds, ...base } = posting;
  const transfer = posting.transferId
    ? db().transfers.find((row) => row.id === posting.transferId)
    : undefined;
  return {
    ...base,
    splits: splits.flatMap((split, sortOrder) => {
      const category = categoryOf(split.categoryId);
      return category
        ? [
            {
              amount: split.amount,
              categoryColor: category.color,
              categoryIcon: category.icon,
              categoryId: category.id,
              categoryName: category.name,
              categoryType: category.type,
              id: split.id,
              sortOrder,
            },
          ]
        : [];
    }),
    tags: db()
      .tags.filter((tag) => tagIds.includes(tag.id))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(({ archivedAt, color, id, name }) => ({
        archivedAt,
        color,
        id,
        name,
      })),
    transfer: transfer ? transferView(transfer) : null,
  };
};

export const transactionRow = (posting: Transaction): TransactionRow => {
  const account = accountOf(posting.accountId);
  const category = categoryOf(posting.categoryId);
  const schedule = db().schedules.find(
    (row) => row.id === posting.recurringScheduleId
  );
  return {
    ...transactionDetails(posting),
    accountClass: account?.accountClass ?? null,
    accountName: account?.name ?? null,
    categoryColor: category?.color ?? null,
    categoryIcon: category?.icon ?? null,
    categoryName: category?.name ?? null,
    recurringScheduleName: schedule?.name ?? null,
    type: category?.type ?? null,
  };
};
