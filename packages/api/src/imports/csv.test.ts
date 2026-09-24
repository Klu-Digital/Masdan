import { describe, expect, it } from "vite-plus/test";

import { decodeCsvBytes, detectDelimiter, parseCsv } from "./csv";

const cellsOf = (text: string, delimiter: "," | ";" | "\t" = ",") =>
  parseCsv(text, { delimiter }).records.map(({ cells }) => cells);

describe("parseCsv", () => {
  it("splits plain rows and ignores a trailing newline", () => {
    expect(cellsOf("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("strips a UTF-8 BOM and handles CRLF and bare CR", () => {
    expect(cellsOf("﻿date,amount\r\n2026-01-01,5\r2026-01-02,6")).toEqual([
      ["date", "amount"],
      ["2026-01-01", "5"],
      ["2026-01-02", "6"],
    ]);
  });

  it("keeps delimiters, escaped quotes and newlines inside quoted fields", () => {
    expect(
      cellsOf('"Jollibee, Makati","He said ""hi""","line 1\nline 2"')
    ).toEqual([["Jollibee, Makati", 'He said "hi"', "line 1\nline 2"]]);
  });

  it("numbers rows like a spreadsheet, counting blank lines but not embedded newlines", () => {
    const { records } = parseCsv('h\n"a\nb"\n\nc\n', { delimiter: "," });
    expect(records.map(({ rowNumber }) => rowNumber)).toEqual([1, 2, 4]);
  });

  it("keeps empty trailing cells and skips whitespace-only rows", () => {
    expect(cellsOf("a,b,\n , ,\n1,,")).toEqual([
      ["a", "b", ""],
      ["1", "", ""],
    ]);
  });

  it("stops at maxRecords and reports truncation", () => {
    const result = parseCsv("a\n1\n2\n3\n", { delimiter: ",", maxRecords: 2 });
    expect(result.records).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(
      parseCsv("a\n1\n\n", { delimiter: ",", maxRecords: 2 }).truncated
    ).toBe(false);
  });

  it("reports the row where an unclosed quote starts", () => {
    const result = parseCsv('a,b\n1,"oops\n2,3', { delimiter: "," });
    expect(result.unterminatedQuoteRow).toBe(2);
    expect(result.records).toHaveLength(2);
  });

  it("treats a stray quote inside an unquoted field as text", () => {
    expect(cellsOf('12" pizza,5')).toEqual([['12" pizza', "5"]]);
  });

  it("parses semicolon and tab delimited files", () => {
    expect(cellsOf("a;b\n1,5;2", ";")).toEqual([
      ["a", "b"],
      ["1,5", "2"],
    ]);
    expect(cellsOf("a\tb", "\t")).toEqual([["a", "b"]]);
  });
});

describe("detectDelimiter", () => {
  it("picks the delimiter that yields the most columns on the first line", () => {
    expect(detectDelimiter("date;amount;memo\n1;2;3")).toBe(";");
    expect(detectDelimiter("date\tamount\n")).toBe("\t");
    expect(detectDelimiter('"a;b",c,d')).toBe(",");
    expect(detectDelimiter("single")).toBe(",");
  });
});

describe("decodeCsvBytes", () => {
  it("decodes UTF-8 and falls back to Windows-1252", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("₱100"))).toBe("₱100");
    expect(decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe(
      "café"
    );
  });
});
