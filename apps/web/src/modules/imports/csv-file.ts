// Leaf modules only: the server-side import code must not reach the bundle.
import {
  decodeCsvBytes,
  detectDelimiter,
  parseCsv,
} from "@masdan/api/imports/csv";
import type { CsvDelimiter, CsvRecord } from "@masdan/api/imports/csv";
import { splitHeader } from "@masdan/api/imports/mapping";

export const SAMPLE_RECORDS = 50;
const CSV_EXTENSION = /\.(?:csv|txt)$/iu;

export interface LocalCsv {
  delimiter: CsvDelimiter;
  fileName: string;
  text: string;
}

export interface CsvSample {
  headers: string[];
  records: CsvRecord[];
  truncated: boolean;
}

export const isCsvFile = (file: File): boolean =>
  CSV_EXTENSION.test(file.name) ||
  file.type === "text/csv" ||
  file.type === "application/vnd.ms-excel";

/** Windows reports CSVs as `application/vnd.ms-excel`, which uploads reject. */
export const asCsvUpload = (file: File): File =>
  file.type === "text/csv"
    ? file
    : new File([file], file.name, { type: "text/csv" });

export const readLocalCsv = async (file: File): Promise<LocalCsv> => {
  const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
  return { delimiter: detectDelimiter(text), fileName: file.name, text };
};

export const sampleCsv = (
  text: string,
  delimiter: CsvDelimiter,
  hasHeaderRow: boolean
): CsvSample => {
  const parsed = parseCsv(text, {
    delimiter,
    maxRecords: SAMPLE_RECORDS + 1,
  });
  const { dataRecords, headers } = splitHeader(parsed.records, hasHeaderRow);
  return {
    headers,
    records: dataRecords.slice(0, SAMPLE_RECORDS),
    truncated: parsed.truncated || dataRecords.length > SAMPLE_RECORDS,
  };
};
