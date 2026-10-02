import { describe, expect, it } from "vite-plus/test";

import { ai, GOLDEN_HOUSEHOLD, GOLDEN_IDS } from "./quick-entry.golden";
import { resolveQuickTransfer } from "./quick-transfer";

const household = {
  ...GOLDEN_HOUSEHOLD,
  accounts: [
    ...GOLDEN_HOUSEHOLD.accounts,
    {
      accountType: "bank",
      cardLastFour: null,
      cardNetwork: null,
      cardProductKey: null,
      currencyCode: "PHP",
      id: "00000000-0000-4000-8000-000000000012",
      institution: "MariBank",
      name: "MariBank",
    },
  ],
};
const text = "transfer 4.5k from gcash to maribank";
const extraction = ai({ account: "gcash", amount: "4.5k", kind: "expense" });

describe("quick transfers", () => {
  it("resolves direction and shorthand amounts without requiring a category", () => {
    expect(resolveQuickTransfer(text, household, extraction)).toMatchObject({
      input: {
        destinationAccountId: household.accounts.at(-1)?.id,
        destinationAmount: "4500",
        sourceAccountId: GOLDEN_IDS.gcash,
        sourceAmount: "4500",
        transactionDate: household.today,
      },
      issues: [],
      kind: "transfer",
    });
  });

  it.each([
    "transfer 4.5k from gcash to gcash",
    "transfer 4.5k from gcash to unionbank",
    "transfer 4.5k from gcash to nonexistent",
    "transfer 4.5k from gcash to hsbc dollar",
    "transfer 4.5k gcash maribank",
    "transfer 4.5k and 500 from gcash to maribank",
    "transfer $4500 from gcash to maribank",
    "transfer 4500 from gcash to maribank February 30",
  ])("requires review rather than guessing: %s", (note) => {
    const result = resolveQuickTransfer(note, household, extraction);
    expect(result?.input).toBeNull();
    expect(result?.issues.length).toBeGreaterThan(0);
  });

  it("keeps deterministic prefill but never creates when AI is unavailable", () => {
    expect(resolveQuickTransfer(text, household, null)).toMatchObject({
      input: null,
      prefill: { sourceAccountId: GOLDEN_IDS.gcash, sourceAmount: "4500" },
    });
  });

  it("leaves ordinary transactions alone", () => {
    expect(
      resolveQuickTransfer("dinner 400 gcash", household, extraction)
    ).toBeNull();
  });
});
