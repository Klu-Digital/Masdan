/** Strict RFC 4180 reader: CRLF rows, a trailing CRLF, quoted fields. */
export const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (quoted && char === '"' && input[index + 1] === '"') {
      field += '"';
      index += 2;
      continue;
    }
    if (quoted) {
      quoted = char !== '"';
      field += quoted ? char : "";
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && input[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else {
      field += char;
    }
    index += 1;
  }
  if (quoted || field !== "" || row.length > 0) {
    throw new Error("CSV did not end with a CRLF row terminator");
  }
  return rows;
};

/** Rows keyed by header; throws if any row's width differs from the header. */
export const parseCsvRecords = (
  input: string
): { headers: string[]; records: Record<string, string>[] } => {
  const [headers = [], ...rows] = parseCsv(input);
  const records = rows.map((row) => {
    if (row.length !== headers.length) {
      throw new Error(
        `CSV row has ${row.length} fields, expected ${headers.length}`
      );
    }
    return Object.fromEntries(
      headers.map((header, column) => [header, row[column] ?? ""])
    );
  });
  return { headers, records };
};
