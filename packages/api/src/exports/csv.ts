export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  /** Free text a person typed, so it is neutralized against formulas. */
  text?: boolean;
  value: (row: Row) => CsvValue;
}

export const CSV_ROW_TERMINATOR = "\r\n";

const NEEDS_QUOTING = /[",\r\n]/u;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/u;

/** RFC 4180: quote on comma, quote, CR or LF, and double embedded quotes. */
export const escapeCsvField = (field: string): string =>
  NEEDS_QUOTING.test(field) ? `"${field.replaceAll('"', '""')}"` : field;

/**
 * Spreadsheets execute a cell starting with `= + - @`; the apostrophe makes
 * them show it as text. Typed columns (amounts) never pass through here, or a
 * negative amount would stop being a number.
 */
export const neutralizeFormula = (field: string): string =>
  FORMULA_TRIGGER.test(field) ? `'${field}` : field;

export const formatCsvValue = (value: CsvValue): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    // Money is numeric text from Postgres; a float here would lose precision.
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`CSV numbers must be safe integers, got ${value}`);
    }
    return String(value);
  }
  return value;
};

export const toCsv = <Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[]
): string => {
  const lines = [columns.map(({ header }) => escapeCsvField(header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const field = formatCsvValue(column.value(row));
          return escapeCsvField(column.text ? neutralizeFormula(field) : field);
        })
        .join(",")
    );
  }
  return `${lines.join(CSV_ROW_TERMINATOR)}${CSV_ROW_TERMINATOR}`;
};
