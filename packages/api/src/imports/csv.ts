// The one CSV reader: the web preview and the worker must parse identically.
// Keep it leaf — the web bundle imports it.

export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export interface CsvRecord {
  cells: string[];
  /** 1-based record position in the file, header included. */
  rowNumber: number;
}

export interface CsvParseResult {
  records: CsvRecord[];
  /** Set when parsing stopped early at `maxRecords`. */
  truncated: boolean;
  /** Row number of a quoted field left open at end of file, if any. */
  unterminatedQuoteRow: number | null;
}

export interface CsvParseOptions {
  delimiter: CsvDelimiter;
  maxRecords?: number;
}

const BOM = "﻿";

const isBlank = (cells: string[]): boolean =>
  cells.every((cell) => cell.trim() === "");

/** RFC 4180, leniently: stray quotes in unquoted fields are kept as text. */
export const parseCsv = (
  input: string,
  { delimiter, maxRecords = Number.POSITIVE_INFINITY }: CsvParseOptions
): CsvParseResult => {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let rowNumber = 1;
  let index = 0;

  const endRecord = (): boolean => {
    cells.push(field);
    if (!isBlank(cells)) {
      records.push({ cells, rowNumber });
    }
    cells = [];
    field = "";
    fieldWasQuoted = false;
    return records.length >= maxRecords;
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === "" && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      cells.push(field);
      field = "";
      fieldWasQuoted = false;
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      if (endRecord()) {
        return {
          records,
          truncated: text.slice(index).trim() !== "",
          unterminatedQuoteRow: null,
        };
      }
      rowNumber += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  const unterminatedQuoteRow = inQuotes ? rowNumber : null;
  if (field !== "" || cells.length > 0 || fieldWasQuoted) {
    endRecord();
  }

  return { records, truncated: false, unterminatedQuoteRow };
};

/** Picks the delimiter that splits the first line into the most columns. */
export const detectDelimiter = (input: string): CsvDelimiter => {
  const [firstLine = ""] = input.replace(BOM, "").split(/\r\n|\r|\n/u, 1);
  let best: CsvDelimiter = ",";
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const [record] = parseCsv(firstLine, { delimiter, maxRecords: 1 }).records;
    const count = record?.cells.length ?? 0;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
};

/** Excel on Windows still writes cp1252; strict UTF-8 first, then fall back. */
export const decodeCsvBytes = (bytes: Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};
