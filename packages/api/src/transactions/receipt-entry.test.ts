import { describe, expect, it } from "vite-plus/test";

import type { QuickEntryHousehold } from "./quick-entry";
import {
  receiptExtraction,
  receiptMessages,
  resolveReceiptEntry,
} from "./receipt-entry";
import { sniffReceiptContentType } from "./receipt-entry.parse";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = (
  n: number,
  name: string,
  cardLastFour: string | null = null
) => ({
  accountType: "credit_card",
  cardLastFour,
  cardNetwork: "Mastercard",
  cardProductKey: null,
  currencyCode: "PHP",
  id: id(n),
  institution: "Metrobank",
  name,
});
const household: QuickEntryHousehold = {
  accounts: [account(1, "Metrobank MC", "4821"), account(2, "Cash")],
  categories: [{ id: id(3), name: "Food & Dining", type: "expense" }],
  today: "2026-09-28",
};
const clear = receiptExtraction.parse({
  accountHint: null,
  cardLastFour: "4821",
  category: "Food & Dining",
  currency: "PHP",
  date: "2026-09-28",
  details: null,
  isReceipt: true,
  kind: "expense",
  merchant: "Jollibee",
  totals: ["400"],
});
const resolve = (
  changes: Partial<typeof clear> = {},
  caption: string | null = null,
  home = household
) => resolveReceiptEntry({ ...clear, ...changes }, caption, home);

describe("receipt entry", () => {
  it("creates a clear paid receipt using only household identifiers", () => {
    expect(resolve().input).toMatchObject({
      accountId: id(1),
      amount: "400",
      categoryId: id(3),
      notes: "Jollibee",
      paidStatus: "paid",
      transactionDate: "2026-09-28",
    });
  });
  it("takes the caption's account when the receipt has no card digits", () => {
    expect(
      resolve({ cardLastFour: null }, "metrobank mc").input?.accountId
    ).toBe(id(1));
  });
  it("holds ambiguous totals", () => {
    expect(resolve({ totals: ["400", "500"] }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "amount", reason: "ambiguous" }),
      ])
    );
    expect(resolve({ totals: ["400", "500"] }).input).toBeNull();
  });
  it("uses a caption amount to settle ambiguous totals", () => {
    expect(
      resolve({ totals: ["400", "500"] }, "metrobank mc 400").input?.amount
    ).toBe("400");
  });
  it("flags a caption contradicting a clear total", () => {
    expect(resolve({}, "metrobank mc 500").issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "amount", reason: "conflict" }),
      ])
    );
  });
  it("requires a payment account when there are multiple accounts", () => {
    expect(resolve({ cardLastFour: null }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "accountId", reason: "missing" }),
      ])
    );
  });
  it("matches the printed card's last four", () => {
    expect(resolve().input?.accountId).toBe(id(1));
  });
  it("falls back to the printed account label when there are no card digits", () => {
    expect(
      resolve({ accountHint: "Metrobank MC", cardLastFour: null }).input
        ?.accountId
    ).toBe(id(1));
  });
  it("holds a printed account label that matches several accounts", () => {
    const home = {
      ...household,
      accounts: [account(1, "Metrobank MC"), account(2, "Metrobank Gold")],
    };
    expect(
      resolve({ accountHint: "Metrobank", cardLastFour: null }, null, home)
        .issues
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "accountId", reason: "ambiguous" }),
      ])
    );
  });
  it("prefers matching card digits over the printed account label", () => {
    expect(resolve({ accountHint: "Cash" }).input?.accountId).toBe(id(1));
  });
  it("requires a payment account when the printed account label matches nothing", () => {
    expect(
      resolve({ accountHint: "BPI Savings", cardLastFour: null }).issues
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "accountId", reason: "missing" }),
      ])
    );
  });
  it("never lets the printed account label pick a card with other digits", () => {
    const home = {
      ...household,
      accounts: [
        account(1, "Metrobank MC", "4821"),
        { ...account(2, "Wallet"), institution: null },
      ],
    };
    const result = resolve(
      { accountHint: "Metrobank MC", cardLastFour: "9999" },
      null,
      home
    );
    expect(result.input).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "accountId", reason: "missing" }),
      ])
    );
  });
  it("never assumes the only account when its card digits differ", () => {
    const home = {
      ...household,
      accounts: [account(1, "Metrobank MC", "4821")],
    };
    expect(resolve({ cardLastFour: "9999" }, null, home).input).toBeNull();
  });
  it("uses the printed account label to choose between cards sharing digits", () => {
    const home = {
      ...household,
      accounts: [
        account(1, "Metrobank MC", "4821"),
        account(2, "Metrobank Gold", "4821"),
      ],
    };
    expect(
      resolve({ accountHint: "Metrobank Gold" }, null, home).input?.accountId
    ).toBe(id(2));
    expect(resolve({ accountHint: null }, null, home).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "accountId",
          message: "More than one account has those card digits",
        }),
      ])
    );
  });
  it("leaves a caption's account issue alone instead of using the printed label", () => {
    const home = {
      ...household,
      accounts: [account(1, "Metrobank MC"), account(2, "Metrobank Gold")],
    };
    expect(
      resolve(
        { accountHint: "Metrobank MC", cardLastFour: null },
        "metrobank",
        home
      ).input
    ).toBeNull();
  });
  it("rejects a conflicting caption account", () => {
    expect(resolve({}, "cash").issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "accountId", reason: "ambiguous" }),
      ])
    );
  });
  it("rejects a currency mismatch", () => {
    expect(resolve({ currency: "USD" }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "amount", reason: "conflict" }),
      ])
    );
  });
  it.each(["2026-09-29", "2026-02-30", "2024-01-01"])(
    "rejects invalid or out-of-range date %s",
    (date) => {
      expect(resolve({ date }).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "transactionDate",
            reason: "invalid",
          }),
        ])
      );
    }
  );
  it("requires a category on the list", () => {
    expect(resolve({ category: "Other" }).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "categoryId", reason: "missing" }),
      ])
    );
  });
  it("rejects non-receipts", () => {
    expect(resolve({ isReceipt: false }).input).toBeNull();
  });
  it("sends no account names or identifiers to the model", () => {
    const messages = JSON.stringify(
      receiptMessages(
        { base64: "AA==", contentType: "image/png" },
        "metrobank mc",
        household
      )
    );
    expect(messages).not.toContain(id(1));
    expect(messages).not.toContain("Metrobank MC");
    expect(messages).toContain("data:image/png;base64,AA==");
  });
});

describe("receipt magic bytes", () => {
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [...Buffer.from("RIFF0000WEBP")]],
    [null, [0x25, 0x50, 0x44, 0x46]],
  ] as const)("recognizes %s", (type, bytes) => {
    expect(sniffReceiptContentType(new Uint8Array(bytes))).toBe(type);
  });
});
