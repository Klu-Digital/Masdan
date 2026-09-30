import type { MoneySign } from "@/components/finance/money";

import type { Transaction } from "./types";

type TransactionKind = "expense" | "income" | "transfer" | "reconciliation";

export interface TransactionView {
  /** Neutral in the household ledger; relative to the posting's account when scoped. */
  direction: "in" | "out" | "none";
  kind: TransactionKind;
  sign: MoneySign;
  subtitle: string;
  title: string;
}

type Presentable = Pick<
  Transaction,
  | "accountName"
  | "adjustmentDirection"
  | "categoryName"
  | "notes"
  | "transfer"
  | "transferSide"
  | "type"
>;

const firstLine = (text: string | null): string | null => {
  const line = text?.split("\n")[0]?.trim();
  return line || null;
};

/**
 * How a ledger row reads. Transactions have no payee, so the title is the
 * first line of the note when there is one and the category otherwise.
 * `scoped` means the list is filtered to accounts, so a transfer posting shows
 * which way money moved for that account.
 */
// oxlint-disable-next-line complexity
export const describeTransaction = (
  transaction: Presentable,
  { scoped = false }: { scoped?: boolean } = {}
): TransactionView => {
  const note = firstLine(transaction.notes);
  const { transfer } = transaction;

  if (transaction.adjustmentDirection) {
    const increasing = transaction.adjustmentDirection === "increase";
    return {
      direction: increasing ? "in" : "out",
      kind: "reconciliation",
      sign: increasing ? "in" : "out",
      subtitle: note ?? transaction.accountName,
      title: "Balance reconciliation",
    };
  }

  if (transfer) {
    const toLiability =
      transfer.destinationAccount.accountClass === "liability";
    const incoming = transaction.transferSide === "destination";
    let title = toLiability
      ? `Payment to ${transfer.destinationAccount.name}`
      : `Transfer to ${transfer.destinationAccount.name}`;
    if (scoped && incoming) {
      title = toLiability
        ? `Payment from ${transfer.sourceAccount.name}`
        : `Transfer from ${transfer.sourceAccount.name}`;
    }
    let direction: TransactionView["direction"] = "none";
    if (scoped) {
      direction = incoming ? "in" : "out";
    }
    return {
      direction,
      kind: "transfer",
      sign: direction === "none" ? "none" : direction,
      subtitle:
        note ??
        `${transfer.sourceAccount.name} → ${transfer.destinationAccount.name}`,
      title,
    };
  }

  const income = transaction.type === "income";
  const category = transaction.categoryName ?? (income ? "Income" : "Expense");
  return {
    direction: income ? "in" : "out",
    kind: income ? "income" : "expense",
    sign: income ? "in" : "out",
    subtitle: note
      ? `${category} · ${transaction.accountName}`
      : transaction.accountName,
    title: note ?? category,
  };
};
