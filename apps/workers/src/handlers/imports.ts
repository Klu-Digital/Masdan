import { processImport } from "@masdan/api/imports/imports.process";
import { db } from "@masdan/db";
import type { JobOf } from "@masdan/queue";

export const handleImportProcess = (
  job: JobOf<"imports.process">
): Promise<void> => processImport(db, job.data.importId);
