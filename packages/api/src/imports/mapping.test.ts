import { describe, expect, it } from "vite-plus/test";

import {
  guessImportMapping,
  importMappingSchema,
  normalizeImportRow,
  parseImportAmount,
  parseImportDate,
  splitHeader,
} from "./mapping";
import type { ImportMapping } from "./mapping";

const mapping: ImportMapping = {
  amount: { column: 2, kind: "signed", negativeMeans: "expense" },
  categoryColumn: 3,
  dateColumn: 0,
  dateFormat: "ymd",
  decimalSeparator: ".",
  delimiter: ",",
  descriptionColumn: 1,
  hasHeaderRow: true,
  notesColumn: 4,
};

const row = (cells: string[], rowNumber = 2) => ({ cells, rowNumber });

describe("parseImportDate", () => {
  it.each([
    ["2026-09-15", "ymd", "2026-09-15"],
    ["2026/9/5", "ymd", "2026-09-05"],
    ["2026-09-15T10:32:00Z", "ymd", "2026-09-15"],
    ["2026-09-15 10:32", "ymd", "2026-09-15"],
    ["09/15/2026", "mdy", "2026-09-15"],
    ["9/15/26", "mdy", "2026-09-15"],
    ["15/09/2026", "dmy", "2026-09-15"],
    ["15.09.2026", "dmy", "2026-09-15"],
    ["15 Sep 2026", "dmy", "2026-09-15"],
    ["15-Sep-26", "dmy", "2026-09-15"],
    ["Sep 15, 2026", "mdy", "2026-09-15"],
    ["September 15, 2026", "dmy", "2026-09-15"],
    ["Tue, 15 Sep 2026", "dmy", "2026-09-15"],
    ["2026-Sep-15", "dmy", "2026-09-15"],
  ] as const)("reads %s as %s", (raw, format, expected) => {
    expect(parseImportDate(raw, format)).toBe(expected);
  });

  it.each([
    ["2026-02-30", "ymd"],
    ["13/13/2026", "dmy"],
    ["09/15/2026", "dmy"],
    ["yesterday", "ymd"],
    ["2026-09", "ymd"],
    ["", "ymd"],
  ] as const)("rejects %s as %s", (raw, format) => {
    expect(parseImportDate(raw, format)).toBeNull();
  });
});

describe("parseImportAmount", () => {
  it.each([
    ["1,234.56", ".", 1_234_560_000n],
    ["-1,234.56", ".", -1_234_560_000n],
    ["(1,234.56)", ".", -1_234_560_000n],
    ["₱ 1,234.56", ".", 1_234_560_000n],
    ["-PHP 50", ".", -50_000_000n],
    ["50.00-", ".", -50_000_000n],
    ["+7", ".", 7_000_000n],
    ["−3", ".", -3_000_000n],
    ["1.234,56", ",", 1_234_560_000n],
    ["1 234,5", ",", 1_234_500_000n],
    ["0.000001", ".", 1n],
    ["0", ".", 0n],
  ] as const)("reads %s", (raw, separator, expected) => {
    expect(parseImportAmount(raw, separator)).toEqual({
      ok: true,
      scaled: expected,
    });
  });

  it("returns null for an empty cell", () => {
    expect(parseImportAmount("  ", ".")).toBeNull();
  });

  it.each([
    ["12abc34", "."],
    ["1.2.3", "."],
    ["1,2,3", ","],
    ["--5", "."],
    ["abc", "."],
  ] as const)("rejects %s", (raw, separator) => {
    expect(parseImportAmount(raw, separator)).toMatchObject({ ok: false });
  });

  it("rejects more than six decimals and absurd magnitudes", () => {
    expect(parseImportAmount("1.1234567", ".")).toEqual({
      message: "Use at most 6 decimal places",
      ok: false,
    });
    expect(parseImportAmount("1".repeat(19), ".")).toEqual({
      message: "Amount is too large",
      ok: false,
    });
  });
});

describe("normalizeImportRow", () => {
  it("maps a negative signed amount to an expense and joins notes", () => {
    expect(
      normalizeImportRow(
        row(["2026-01-05", "Jollibee", "-250.50", "Dining", "lunch"]),
        mapping
      )
    ).toEqual({
      amount: "250.5",
      categoryName: "Dining",
      description: "Jollibee",
      errors: [],
      notes: "Jollibee\nlunch",
      transactionDate: "2026-01-05",
      type: "expense",
    });
  });

  it("inverts the sign when negatives mean income", () => {
    const inverted: ImportMapping = {
      ...mapping,
      amount: { column: 2, kind: "signed", negativeMeans: "income" },
    };
    expect(
      normalizeImportRow(row(["2026-01-05", "Refund", "-20", "", ""]), inverted)
    ).toMatchObject({ amount: "20", categoryName: null, type: "income" });
  });

  it("reads debit and credit columns", () => {
    const split: ImportMapping = {
      ...mapping,
      amount: { creditColumn: 3, debitColumn: 2, kind: "debitCredit" },
      categoryColumn: null,
      notesColumn: null,
    };
    expect(
      normalizeImportRow(row(["2026-01-05", "ATM", "1,000.00", ""]), split)
    ).toMatchObject({ amount: "1000", type: "expense" });
    expect(
      normalizeImportRow(row(["2026-01-05", "Pay", "0.00", "5,000"]), split)
    ).toMatchObject({ amount: "5000", type: "income" });
    expect(
      normalizeImportRow(row(["2026-01-05", "Both", "1", "2"]), split).errors
    ).toEqual([
      {
        field: "amount",
        message: "Both debit and credit have a value; keep one",
      },
    ]);
    expect(
      normalizeImportRow(row(["2026-01-05", "None", "", ""]), split).errors
    ).toEqual([
      { field: "amount", message: "Debit and credit are both empty" },
    ]);
  });

  it("collects every problem on a malformed row instead of stopping at the first", () => {
    const result = normalizeImportRow(row(["31/31/2026", "x", "abc"]), mapping);
    expect(result.errors).toEqual([
      {
        field: "date",
        message: 'Can\'t read "31/31/2026" as Year-Month-Day (2026-09-15)',
      },
      { field: "amount", message: 'Can\'t read "abc" as an amount' },
      {
        field: "notes",
        message: "This row has 3 columns; column 5 is missing",
      },
      {
        field: "category",
        message: "This row has 3 columns; column 4 is missing",
      },
    ]);
    expect(result.description).toBe("x");
  });

  it("flags empty dates, empty and zero amounts, and over-long notes", () => {
    expect(
      normalizeImportRow(row(["", "a", "", "", ""]), mapping).errors
    ).toEqual([
      { field: "date", message: "Date is empty" },
      { field: "amount", message: "Amount is empty" },
    ]);
    expect(
      normalizeImportRow(row(["2026-01-01", "a", "0.00", "", ""]), mapping)
        .errors
    ).toEqual([{ field: "amount", message: "Amount is zero" }]);
    expect(
      normalizeImportRow(
        row(["2026-01-01", "a".repeat(2001), "5", "", ""]),
        mapping
      ).errors
    ).toEqual([
      {
        field: "description",
        message: "Description and notes are longer than 2,000 characters",
      },
    ]);
  });
});

describe("splitHeader", () => {
  it("names headerless columns and pads short headers", () => {
    expect(splitHeader([row(["a", "b"], 1)], false).headers).toEqual([
      "Column 1",
      "Column 2",
    ]);
    const split = splitHeader([row(["Date"], 1), row(["x", "y"], 2)], true);
    expect(split.headers).toEqual(["Date", "Column 2"]);
    expect(split.dataRecords).toHaveLength(1);
  });
});

describe("guessImportMapping", () => {
  it("finds debit/credit bank columns", () => {
    const guess = guessImportMapping(
      ["Posting Date", "Particulars", "Withdrawal", "Deposit", "Balance"],
      { delimiter: ",", hasHeaderRow: true }
    );
    expect(guess).toMatchObject({
      amount: { creditColumn: 3, debitColumn: 2, kind: "debitCredit" },
      dateColumn: 0,
      descriptionColumn: 1,
    });
    expect(importMappingSchema.safeParse(guess).success).toBe(true);
  });

  it("finds a signed amount with category and notes", () => {
    expect(
      guessImportMapping(
        ["Date", "Description", "Amount", "Category", "Notes"],
        {
          delimiter: ",",
          hasHeaderRow: true,
        }
      )
    ).toMatchObject({
      amount: { column: 2, kind: "signed" },
      categoryColumn: 3,
      notesColumn: 4,
    });
  });
});
