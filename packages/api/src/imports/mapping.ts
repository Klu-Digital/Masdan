import { z } from "zod";

import { formatScaledAmount, scaledAmount } from "../shared/money";
import { CSV_DELIMITERS } from "./csv";
import type { CsvRecord } from "./csv";

/** Leaf module shared by the web mapping form and the import worker. */

export const IMPORT_DATE_FORMATS = ["ymd", "mdy", "dmy"] as const;
export type ImportDateFormat = (typeof IMPORT_DATE_FORMATS)[number];

export const IMPORT_DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
  dmy: "Day / Month / Year (15/09/2026)",
  mdy: "Month / Day / Year (09/15/2026)",
  ymd: "Year-Month-Day (2026-09-15)",
};

export const OPENING_BALANCE_MODES = ["reject", "rebase", "include"] as const;
export type OpeningBalanceMode = (typeof OPENING_BALANCE_MODES)[number];

export const MAX_IMPORT_ROWS = 10_000;
const MAX_IMPORT_COLUMNS = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_WHOLE_DIGITS = 18;

const columnIndex = z
  .number()
  .int()
  .min(0)
  .max(MAX_IMPORT_COLUMNS - 1);

const importAmountMappingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      column: columnIndex,
      kind: z.literal("signed"),
      /** What a negative number means in this file. */
      negativeMeans: z.enum(["expense", "income"]),
    })
    .strict(),
  z
    .object({
      creditColumn: columnIndex,
      debitColumn: columnIndex,
      kind: z.literal("debitCredit"),
    })
    .strict(),
]);

export const importMappingSchema = z
  .object({
    amount: importAmountMappingSchema,
    categoryColumn: columnIndex.nullable(),
    dateColumn: columnIndex,
    dateFormat: z.enum(IMPORT_DATE_FORMATS),
    decimalSeparator: z.enum([".", ","]),
    delimiter: z.enum(CSV_DELIMITERS),
    descriptionColumn: columnIndex,
    hasHeaderRow: z.boolean(),
    notesColumn: columnIndex.nullable(),
  })
  .strict();

export type ImportMapping = z.infer<typeof importMappingSchema>;

interface ImportRowError {
  field: string;
  message: string;
}

export type ImportDirection = "income" | "expense";

export interface NormalizedImportRow {
  /** Positive decimal string, the same shape manual entry accepts. */
  amount: string | null;
  categoryName: string | null;
  description: string | null;
  errors: ImportRowError[];
  notes: string | null;
  transactionDate: string | null;
  type: ImportDirection | null;
}

const columnLabel = (headers: string[], index: number): string => {
  const header = headers[index]?.trim();
  return header || `Column ${index + 1}`;
};

/** Header names and data rows; a headerless file gets `Column n` names. */
export const splitHeader = (
  records: CsvRecord[],
  hasHeaderRow: boolean
): { dataRecords: CsvRecord[]; headers: string[] } => {
  const width = Math.max(0, ...records.map(({ cells }) => cells.length));
  if (hasHeaderRow) {
    const [header, ...dataRecords] = records;
    const cells = header?.cells ?? [];
    return {
      dataRecords,
      headers: Array.from({ length: Math.max(width, cells.length) }, (_, i) =>
        columnLabel(cells, i)
      ),
    };
  }
  return {
    dataRecords: records,
    headers: Array.from({ length: width }, (_, i) => columnLabel([], i)),
  };
};

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const WEEKDAY_PATTERN = /^(?:mon|tue|wed|thu|fri|sat|sun)/u;
const DATE_TOKEN_PATTERN = /[a-z]+|\d+/gu;
const DIGITS_PATTERN = /^\d+$/u;

const monthFromName = (token: string): number | null => {
  const index = MONTH_NAMES.indexOf(token.slice(0, 3));
  return index === -1 ? null : index + 1;
};

const fullYear = (token: string): number =>
  token.length <= 2 ? 2000 + Number(token) : Number(token);

const isoDate = (year: number, month: number, day: number): string | null => {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

/** Reads the first three date parts, so a trailing time is ignored. */
export const parseImportDate = (
  raw: string,
  format: ImportDateFormat
): string | null => {
  const tokens = (raw.toLowerCase().match(DATE_TOKEN_PATTERN) ?? []).filter(
    (token) => !WEEKDAY_PATTERN.test(token) || monthFromName(token) !== null
  );
  const named = tokens.findIndex((token) => !DIGITS_PATTERN.test(token));

  if (named !== -1 && named < 3) {
    const month = monthFromName(tokens[named] ?? "");
    const numbers = tokens
      .slice(0, 3)
      .filter((_, index) => index !== named)
      .filter((token) => DIGITS_PATTERN.test(token));
    const [first = "", second = ""] = numbers;
    if (month === null || numbers.length !== 2) {
      return null;
    }
    let yearFirst = format === "ymd";
    if (first.length === 4) {
      yearFirst = true;
    } else if (second.length === 4) {
      yearFirst = false;
    }
    return yearFirst
      ? isoDate(fullYear(first), month, Number(second))
      : isoDate(fullYear(second), month, Number(first));
  }

  const [a = "", b = "", c = ""] = tokens;
  if (![a, b, c].every((token) => DIGITS_PATTERN.test(token))) {
    return null;
  }
  if (format === "ymd") {
    return isoDate(fullYear(a), Number(b), Number(c));
  }
  if (format === "mdy") {
    return isoDate(fullYear(c), Number(a), Number(b));
  }
  return isoDate(fullYear(c), Number(b), Number(a));
};

export type ParsedAmount =
  | { ok: true; scaled: bigint }
  | { message: string; ok: false };

const EDGE_NOISE = /^[\p{L}\p{Sc}\s]+|[\p{L}\p{Sc}\s]+$/gu;
const PARENTHESES = /^\(.*\)$/u;
const DECIMAL_PATTERN = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u;
const DOT_GROUPING = /[.\s']/gu;
const COMMA_GROUPING = /[,\s']/gu;

/** Signed amount in millionths; `null` for an empty cell. */
export const parseImportAmount = (
  raw: string,
  decimalSeparator: "." | ","
): ParsedAmount | null => {
  if (raw.trim() === "") {
    return null;
  }
  let text = raw.trim().replaceAll("−", "-").replace(EDGE_NOISE, "");

  let negative = false;
  if (PARENTHESES.test(text)) {
    negative = true;
    text = text.slice(1, -1).replace(EDGE_NOISE, "");
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  } else if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }
  text = text.replace(EDGE_NOISE, "");

  if (decimalSeparator === ",") {
    text = text.replace(DOT_GROUPING, "");
    if (text.split(",").length > 2) {
      return { message: `Can't read "${raw.trim()}" as an amount`, ok: false };
    }
    text = text.replace(",", ".");
  } else {
    text = text.replace(COMMA_GROUPING, "");
  }

  const match = DECIMAL_PATTERN.exec(text);
  if (!match?.groups) {
    return { message: `Can't read "${raw.trim()}" as an amount`, ok: false };
  }
  const { fraction = "", whole = "" } = match.groups;
  if (fraction.length > 6) {
    return { message: "Use at most 6 decimal places", ok: false };
  }
  if (whole.replace(/^0+/u, "").length > MAX_WHOLE_DIGITS) {
    return { message: "Amount is too large", ok: false };
  }

  const scaled = scaledAmount(text);
  return { ok: true, scaled: negative ? -scaled : scaled };
};

const cellAt = (
  record: CsvRecord,
  column: number,
  field: string,
  errors: ImportRowError[]
): string | null => {
  const value = record.cells[column];
  if (value === undefined) {
    errors.push({
      field,
      message: `This row has ${record.cells.length} columns; column ${column + 1} is missing`,
    });
    return null;
  }
  return value.trim();
};

type AmountMapping = ImportMapping["amount"];

const singleColumnAmount = (
  record: CsvRecord,
  amount: Extract<AmountMapping, { kind: "signed" }>,
  decimalSeparator: ImportMapping["decimalSeparator"],
  errors: ImportRowError[]
): bigint | null => {
  const cell = cellAt(record, amount.column, "amount", errors);
  if (cell === null) {
    return null;
  }
  const parsed = parseImportAmount(cell, decimalSeparator);
  if (!parsed) {
    errors.push({ field: "amount", message: "Amount is empty" });
    return null;
  }
  if (!parsed.ok) {
    errors.push({ field: "amount", message: parsed.message });
    return null;
  }
  return amount.negativeMeans === "expense" ? parsed.scaled : -parsed.scaled;
};

/** An empty cell reads as zero; a malformed one records an error. */
const sideAmount = (
  record: CsvRecord,
  column: number,
  field: "debit" | "credit",
  decimalSeparator: ImportMapping["decimalSeparator"],
  errors: ImportRowError[]
): { empty: boolean; value: bigint } | null => {
  const cell = cellAt(record, column, field, errors);
  if (cell === null) {
    return null;
  }
  const parsed = parseImportAmount(cell, decimalSeparator);
  if (!parsed) {
    return { empty: true, value: 0n };
  }
  if (!parsed.ok) {
    errors.push({ field, message: parsed.message });
    return null;
  }
  return { empty: false, value: parsed.scaled };
};

const debitCreditAmount = (
  record: CsvRecord,
  amount: Extract<AmountMapping, { kind: "debitCredit" }>,
  decimalSeparator: ImportMapping["decimalSeparator"],
  errors: ImportRowError[]
): bigint | null => {
  const debit = sideAmount(
    record,
    amount.debitColumn,
    "debit",
    decimalSeparator,
    errors
  );
  const credit = sideAmount(
    record,
    amount.creditColumn,
    "credit",
    decimalSeparator,
    errors
  );
  if (!debit || !credit) {
    return null;
  }
  if (debit.value !== 0n && credit.value !== 0n) {
    errors.push({
      field: "amount",
      message: "Both debit and credit have a value; keep one",
    });
    return null;
  }
  if (debit.empty && credit.empty) {
    errors.push({
      field: "amount",
      message: "Debit and credit are both empty",
    });
    return null;
  }
  return credit.value - debit.value;
};

const signedAmount = (
  record: CsvRecord,
  { amount, decimalSeparator }: ImportMapping,
  errors: ImportRowError[]
): bigint | null =>
  amount.kind === "signed"
    ? singleColumnAmount(record, amount, decimalSeparator, errors)
    : debitCreditAmount(record, amount, decimalSeparator, errors);

/** Maps one CSV record to transaction fields, collecting every problem. */
export const normalizeImportRow = (
  record: CsvRecord,
  mapping: ImportMapping
): NormalizedImportRow => {
  const errors: ImportRowError[] = [];

  const dateCell = cellAt(record, mapping.dateColumn, "date", errors);
  let transactionDate: string | null = null;
  if (dateCell === "") {
    errors.push({ field: "date", message: "Date is empty" });
  } else if (dateCell !== null) {
    transactionDate = parseImportDate(dateCell, mapping.dateFormat);
    if (!transactionDate) {
      errors.push({
        field: "date",
        message: `Can't read "${dateCell}" as ${IMPORT_DATE_FORMAT_LABELS[mapping.dateFormat]}`,
      });
    }
  }

  const signed = signedAmount(record, mapping, errors);
  let amount: string | null = null;
  let type: ImportDirection | null = null;
  if (signed === 0n) {
    errors.push({ field: "amount", message: "Amount is zero" });
  } else if (signed !== null) {
    amount = formatScaledAmount(signed < 0n ? -signed : signed);
    type = signed < 0n ? "expense" : "income";
  }

  const description =
    cellAt(record, mapping.descriptionColumn, "description", errors) || null;
  const extraNotes =
    mapping.notesColumn === null
      ? null
      : cellAt(record, mapping.notesColumn, "notes", errors) || null;
  const categoryName =
    mapping.categoryColumn === null
      ? null
      : cellAt(record, mapping.categoryColumn, "category", errors) || null;

  const notes =
    [description, extraNotes].filter(Boolean).join("\n").trim() || null;
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    errors.push({
      field: "description",
      message: "Description and notes are longer than 2,000 characters",
    });
  }

  return {
    amount,
    categoryName,
    description,
    errors,
    notes,
    transactionDate,
    type,
  };
};

const GUESSES = {
  category: /categ/iu,
  credit: /credit|deposit|money in|inflow/iu,
  date: /date|posted|posting/iu,
  debit: /debit|withdraw|money out|outflow/iu,
  description: /desc|detail|particular|narrat|memo|payee|merchant|reference/iu,
  notes: /note|remark|comment/iu,
  signed: /amount|value|total/iu,
};

const findColumn = (
  headers: string[],
  pattern: RegExp,
  taken: Set<number>
): number | null => {
  const index = headers.findIndex(
    (header, i) => !taken.has(i) && pattern.test(header)
  );
  if (index === -1) {
    return null;
  }
  taken.add(index);
  return index;
};

/** A starting point for the mapping form, guessed from header names. */
export const guessImportMapping = (
  headers: string[],
  base: Pick<ImportMapping, "delimiter" | "hasHeaderRow">
): ImportMapping => {
  const taken = new Set<number>();
  const dateColumn = findColumn(headers, GUESSES.date, taken) ?? 0;
  const debitColumn = findColumn(headers, GUESSES.debit, taken);
  const creditColumn = findColumn(headers, GUESSES.credit, taken);
  const signedColumn =
    debitColumn !== null && creditColumn !== null
      ? null
      : findColumn(headers, GUESSES.signed, taken);
  const descriptionColumn =
    findColumn(headers, GUESSES.description, taken) ??
    headers.findIndex((_, i) => !taken.has(i));
  if (descriptionColumn >= 0) {
    taken.add(descriptionColumn);
  }

  return {
    ...base,
    amount:
      debitColumn !== null && creditColumn !== null
        ? { creditColumn, debitColumn, kind: "debitCredit" }
        : {
            column:
              signedColumn ??
              Math.max(
                0,
                headers.findIndex((_, i) => !taken.has(i))
              ),
            kind: "signed",
            negativeMeans: "expense",
          },
    categoryColumn: findColumn(headers, GUESSES.category, taken),
    dateColumn,
    dateFormat: "ymd",
    decimalSeparator: ".",
    descriptionColumn: Math.max(0, descriptionColumn),
    notesColumn: findColumn(headers, GUESSES.notes, taken),
  };
};
