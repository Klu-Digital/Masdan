const BYTE_ORDER_MARK = "﻿";
const NON_FILE_SAFE = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;

/** `Casa Reyes`, `2026-09-24`, `transactions.csv` → `casa-reyes-2026-09-24-transactions.csv`. */
export const exportFileName = (
  householdName: string,
  today: string,
  fileName: string
): string => {
  const slug = householdName
    .toLowerCase()
    .replaceAll(NON_FILE_SAFE, "-")
    .replaceAll(EDGE_DASHES, "");
  return `${slug || "household"}-${today}-${fileName}`;
};

/** Without the BOM, Excel reads the file as ANSI and mangles `₱` and `ñ`. */
export const downloadCsv = (fileName: string, csv: string): void => {
  const url = URL.createObjectURL(
    new Blob([BYTE_ORDER_MARK, csv], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking synchronously can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
