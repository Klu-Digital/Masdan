import { parseCsv } from "@masdan/testing/csv";
import { describe, expect, it } from "vite-plus/test";

import type { CsvColumn } from "./csv";
import {
  escapeCsvField,
  formatCsvValue,
  neutralizeFormula,
  toCsv,
} from "./csv";

interface Row {
  amount: string;
  archivedAt: Date | null;
  count: number;
  date: string;
  flag: boolean;
  note: string | null;
}

const columns: CsvColumn<Row>[] = [
  { header: "date", value: (row) => row.date },
  { header: "amount", value: (row) => row.amount },
  { header: "note", text: true, value: (row) => row.note },
  { header: "flag", value: (row) => row.flag },
  { header: "count", value: (row) => row.count },
  { header: "archived_at", value: (row) => row.archivedAt },
];

const baseRow: Row = {
  amount: "10.000000",
  archivedAt: null,
  count: 0,
  date: "2026-01-31",
  flag: false,
  note: null,
};

describe("escapeCsvField", () => {
  it("leaves plain fields bare", () => {
    expect(escapeCsvField("Groceries")).toBe("Groceries");
    expect(escapeCsvField("")).toBe("");
    expect(escapeCsvField("  padded  ")).toBe("  padded  ");
  });

  it("quotes commas, quotes, CR and LF and doubles embedded quotes", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvField("line\r\nbreak")).toBe('"line\r\nbreak"');
    expect(escapeCsvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });
});

describe("neutralizeFormula", () => {
  it("prefixes every spreadsheet formula trigger", () => {
    expect(neutralizeFormula("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(neutralizeFormula("+63 917")).toBe("'+63 917");
    expect(neutralizeFormula("-cmd")).toBe("'-cmd");
    expect(neutralizeFormula("@HYPERLINK")).toBe("'@HYPERLINK");
    expect(neutralizeFormula("\tTab")).toBe("'\tTab");
    expect(neutralizeFormula("\rCR")).toBe("'\rCR");
  });

  it("leaves ordinary text alone", () => {
    expect(neutralizeFormula("Rent = 2 months")).toBe("Rent = 2 months");
    expect(neutralizeFormula("")).toBe("");
  });
});

describe("formatCsvValue", () => {
  it("renders null and undefined as an empty field", () => {
    expect(formatCsvValue(null)).toBe("");
    expect(formatCsvValue(new Map<string, string>().get("missing"))).toBe("");
  });

  it("renders timestamps as ISO 8601 UTC and booleans as words", () => {
    expect(formatCsvValue(new Date("2026-03-04T05:06:07.089Z"))).toBe(
      "2026-03-04T05:06:07.089Z"
    );
    expect(formatCsvValue(true)).toBe("true");
    expect(formatCsvValue(false)).toBe("false");
  });

  it("accepts integers and refuses floats", () => {
    expect(formatCsvValue(31)).toBe("31");
    expect(formatCsvValue(-2)).toBe("-2");
    expect(() => formatCsvValue(0.1 + 0.2)).toThrow(/safe integers/u);
    expect(() => formatCsvValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /safe integers/u
    );
  });
});

describe("toCsv", () => {
  it("writes a header-only file with a trailing CRLF when empty", () => {
    expect(toCsv(columns, [])).toBe(
      "date,amount,note,flag,count,archived_at\r\n"
    );
  });

  it("keeps amounts exact and negative amounts numeric", () => {
    const csv = toCsv(columns, [
      { ...baseRow, amount: "-1234567890123456789012.123456" },
      { ...baseRow, amount: "0.000001" },
    ]);
    expect(csv).toContain("\r\n2026-01-31,-1234567890123456789012.123456,");
    expect(parseCsv(csv).map((row) => row[1])).toEqual([
      "amount",
      "-1234567890123456789012.123456",
      "0.000001",
    ]);
  });

  it("round-trips commas, quotes, line breaks and unicode in text", () => {
    const notes = [
      'Lunch, "Jollibee"',
      "first line\nsecond line",
      "windows\r\nbreak",
      "₱ señor 日本 🧾",
      "",
    ];
    const rows = notes.map((note) => ({ ...baseRow, note }));
    expect(parseCsv(toCsv(columns, rows)).map((row) => row[2])).toEqual([
      "note",
      ...notes,
    ]);
  });

  it("neutralizes formulas only in text columns", () => {
    const parsed = parseCsv(
      toCsv(columns, [
        { ...baseRow, amount: "-5.000000", note: '=HYPERLINK("x")' },
      ])
    );
    expect(parsed[1]).toEqual([
      "2026-01-31",
      "-5.000000",
      '\'=HYPERLINK("x")',
      "false",
      "0",
      "",
    ]);
  });

  it("is deterministic for the same rows", () => {
    const rows = [
      {
        ...baseRow,
        archivedAt: new Date("2026-02-01T00:00:00.000Z"),
        count: 3,
        flag: true,
        note: "a,b",
      },
    ];
    expect(toCsv(columns, rows)).toBe(toCsv(columns, rows));
    expect(toCsv(columns, rows)).toBe(
      'date,amount,note,flag,count,archived_at\r\n2026-01-31,10.000000,"a,b",true,3,2026-02-01T00:00:00.000Z\r\n'
    );
  });
});
