import { describe, expect, it } from "vite-plus/test";

import { describeTransaction } from "./presentation";

const base = {
  accountName: "BPI Savings",
  categoryName: "Groceries",
  notes: null,
  transfer: null,
  transferSide: null,
  type: "expense",
};

const transfer = {
  destinationAccount: {
    accountClass: "liability",
    currencyCode: "PHP",
    id: "card",
    name: "Amore Visa",
  },
  sourceAccount: {
    accountClass: "asset",
    currencyCode: "PHP",
    id: "bank",
    name: "BPI Savings",
  },
};

describe("describeTransaction", () => {
  it("titles an entry by its note's first line, falling back to the category", () => {
    expect(describeTransaction(base)).toMatchObject({
      direction: "out",
      subtitle: "BPI Savings",
      title: "Groceries",
    });
    expect(
      describeTransaction({
        ...base,
        notes: "Weekly market\nreceipt in drawer",
      })
    ).toMatchObject({
      subtitle: "Groceries · BPI Savings",
      title: "Weekly market",
    });
  });

  it("treats income as money in", () => {
    expect(describeTransaction({ ...base, type: "income" })).toMatchObject({
      direction: "in",
      kind: "income",
      sign: "in",
    });
  });

  it("names a transfer into a liability as a payment, neutral in the household ledger", () => {
    const view = describeTransaction({
      ...base,
      transfer: transfer as never,
      transferSide: "source",
    });
    expect(view).toMatchObject({
      direction: "none",
      kind: "transfer",
      title: "Payment to Amore Visa",
    });
  });

  it("shows a transfer's direction when the ledger is one account's", () => {
    const incoming = describeTransaction(
      { ...base, transfer: transfer as never, transferSide: "destination" },
      { scoped: true }
    );
    expect(incoming).toMatchObject({
      direction: "in",
      title: "Payment from BPI Savings",
    });
  });
});
