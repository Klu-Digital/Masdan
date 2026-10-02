import { createHash } from "node:crypto";

import type { Database } from "@masdan/db";
import {
  category,
  file,
  financialAccount,
  financialTransaction,
  financialTransactionTag,
  tag,
  transactionImport,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type {
  TransactionImportRowError,
  TransactionImportRowStatus,
  TransactionRuleApplication,
  TransactionSuggestionApplication,
} from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";
import { storage } from "@masdan/storage";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { getAccountBalance } from "../accounts/balances";
import { applyRuleActions, findMatchingRule } from "../rules/engine";
import { loadRules, runnableRules } from "../rules/rules.data";
import type { StoredRule } from "../rules/rules.data";
import { chunks } from "../shared/chunks";
import { householdSettings } from "../shared/household";
import { scaledAmount } from "../shared/money";
import { transactionInsertValues } from "../transactions/transactions.write";
import { decodeCsvBytes, parseCsv } from "./csv";
import {
  MAX_IMPORT_ROWS,
  importMappingSchema,
  normalizeImportRow,
  splitHeader,
} from "./mapping";
import type {
  ImportDirection,
  NormalizedImportRow,
  OpeningBalanceMode,
} from "./mapping";

/** Worker-side import processing. No procedure ladder: apps/workers runs it. */

const CHUNK_SIZE = 500;

/** A failure the user can act on; its message is shown as-is. */
class ImportFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFailureError";
  }
}

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const normalizeDescription = (value: string | null): string =>
  (value ?? "").toLowerCase().replaceAll(/\s+/gu, " ").trim();

interface ImportCategory {
  archivedAt: Date | null;
  id: string;
  name: string;
  type: string;
}

const openingDateMessage = (openingBalanceDate: string): string =>
  `Dated before this account's opening balance date (${openingBalanceDate}). Choose to add earlier rows as history, or move the account's opening date.`;

const lockImport = async (db: Database, importId: string) => {
  const [locked] = await db
    .select()
    .from(transactionImport)
    .where(eq(transactionImport.id, importId))
    .for("update")
    .limit(1);
  return locked;
};

const loadAccount = async (
  db: Database,
  organizationId: string,
  accountId: string,
  lock?: "update"
) => {
  const query = db
    .select({
      archivedAt: financialAccount.archivedAt,
      currencyCode: financialAccount.currencyCode,
      id: financialAccount.id,
      openingBalanceDate: financialAccount.openingBalanceDate,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .limit(1);
  const [account] = await (lock ? query.for(lock) : query);
  if (!account || account.archivedAt !== null) {
    throw new ImportFailureError(
      "The destination account was archived or removed. Start a new import for another account."
    );
  }
  return account;
};

const rowCounts = async (db: Database, importId: string) => {
  const rows = await db
    .select({ status: transactionImportRow.status, total: count() })
    .from(transactionImportRow)
    .where(eq(transactionImportRow.importId, importId))
    .groupBy(transactionImportRow.status);
  const totals = new Map(rows.map(({ status, total }) => [status, total]));
  return {
    duplicateRows: totals.get("duplicate") ?? 0,
    importedRows: totals.get("imported") ?? 0,
    invalidRows: totals.get("invalid") ?? 0,
    totalRows: rows.reduce((sum, { total }) => sum + total, 0),
    validRows: totals.get("valid") ?? 0,
  };
};

const readSource = async (db: Database, importId: string) => {
  const [source] = await db
    .select({
      fileStatus: file.status,
      key: file.key,
      organizationId: transactionImport.organizationId,
    })
    .from(transactionImport)
    .leftJoin(
      file,
      and(
        eq(file.id, transactionImport.sourceFileId),
        eq(file.organizationId, transactionImport.organizationId)
      )
    )
    .where(eq(transactionImport.id, importId))
    .limit(1);

  if (!source?.key || source.fileStatus !== "ready") {
    throw new ImportFailureError(
      "The uploaded file is no longer available. Upload it again."
    );
  }
  if (!storage.isConfigured()) {
    throw new ImportFailureError(
      "File storage is not configured for background processing."
    );
  }
  const bytes = await storage.getObject({ key: source.key });
  if (!bytes) {
    throw new ImportFailureError(
      "The uploaded file is no longer available. Upload it again."
    );
  }
  return bytes;
};

interface ClassifiedRow {
  amount: string | null;
  categoryId: string | null;
  description: string | null;
  errors: TransactionImportRowError[];
  fingerprint: string | null;
  notes: string | null;
  raw: string[];
  rowNumber: number;
  ruleApplication: TransactionRuleApplication | null;
  status: TransactionImportRowStatus;
  transactionDate: string | null;
  type: ImportDirection | null;
}

const applyImportRules = (
  rules: readonly StoredRule[],
  accountId: string | null,
  row: Pick<NormalizedImportRow, "amount" | "notes" | "type">,
  categoryId: string | null
): {
  categoryId: string | null;
  ruleApplication: TransactionRuleApplication | null;
} => {
  const match =
    categoryId && row.amount && row.type
      ? findMatchingRule(rules, {
          accountId,
          amount: row.amount,
          description: row.notes,
          type: row.type,
        })
      : null;
  if (!match || !categoryId) {
    return { categoryId, ruleApplication: null };
  }
  const outcome = applyRuleActions(match.rule, { categoryId, tagIds: [] });
  return {
    categoryId: outcome.categoryId,
    ruleApplication: outcome.application,
  };
};

/** A row carries a rule's tags or an accepted suggestion's, never both. */
const rowTagIds = (row: {
  ruleApplication: TransactionRuleApplication | null;
  suggestionApplication: TransactionSuggestionApplication | null;
}): string[] => [
  ...new Set([
    ...(row.ruleApplication?.tagIds ?? []),
    ...(row.suggestionApplication?.tagIds ?? []),
  ]),
];

const existingFingerprints = async (
  db: Database,
  organizationId: string,
  accountId: string | null,
  fingerprints: string[]
): Promise<Set<string>> => {
  const found = new Set<string>();
  for (const batch of chunks(fingerprints, 1000)) {
    const rows = await db
      .select({ fingerprint: financialTransaction.importFingerprint })
      .from(financialTransaction)
      .where(
        and(
          eq(financialTransaction.organizationId, organizationId),
          accountId
            ? eq(financialTransaction.accountId, accountId)
            : isNull(financialTransaction.accountId),
          inArray(financialTransaction.importFingerprint, batch)
        )
      );
    for (const { fingerprint } of rows) {
      if (fingerprint) {
        found.add(fingerprint);
      }
    }
  }
  return found;
};

const validateImport = async (
  db: Database,
  importId: string
): Promise<void> => {
  // Read before the transaction: no row lock held across a bucket round trip.
  const bytes = await readSource(db, importId);
  const checksum = sha256(bytes);

  await db.transaction(async (tx) => {
    const current = await lockImport(tx, importId);
    if (current?.status !== "validating") {
      return;
    }
    const parsedMapping = importMappingSchema.safeParse(current.mapping);
    if (!parsedMapping.success) {
      throw new ImportFailureError(
        "The column mapping is invalid. Map it again."
      );
    }
    const mapping = parsedMapping.data;
    const account = current.accountId
      ? await loadAccount(tx, current.organizationId, current.accountId)
      : null;

    const parsed = parseCsv(decodeCsvBytes(bytes), {
      delimiter: mapping.delimiter,
      maxRecords: MAX_IMPORT_ROWS + 1,
    });
    const { dataRecords, headers } = splitHeader(
      parsed.records,
      mapping.hasHeaderRow
    );
    if (parsed.truncated || dataRecords.length > MAX_IMPORT_ROWS) {
      throw new ImportFailureError(
        `This file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files.`
      );
    }
    if (dataRecords.length === 0) {
      throw new ImportFailureError("The file has no rows to import.");
    }

    const categories: ImportCategory[] = await tx
      .select({
        archivedAt: category.archivedAt,
        id: category.id,
        name: category.name,
        type: category.type,
      })
      .from(category)
      .where(eq(category.organizationId, current.organizationId));
    const byName = new Map(
      categories.map((item) => [item.name.toLowerCase(), item])
    );
    const defaults: Record<ImportDirection, string> = {
      expense: current.defaultExpenseCategoryId,
      income: current.defaultIncomeCategoryId,
    };
    const rules = runnableRules(await loadRules(tx, current.organizationId));

    const occurrences = new Map<string, number>();
    // oxlint-disable-next-line complexity
    const classified: ClassifiedRow[] = dataRecords.map((record) => {
      const row = normalizeImportRow(record, mapping);
      const errors: TransactionImportRowError[] = [...row.errors];

      if (parsed.unterminatedQuoteRow === record.rowNumber) {
        errors.push({
          field: "row",
          message:
            "A quoted value on this row is never closed, so the rest of the file was read into it.",
        });
      }

      let categoryId: string | null = row.type ? defaults[row.type] : null;
      if (row.categoryName && row.type) {
        const match = byName.get(row.categoryName.toLowerCase());
        if (!match) {
          errors.push({
            field: "category",
            message: `No category named "${row.categoryName}" in this household. Create it, or unmap the category column to use the defaults.`,
          });
        } else if (match.archivedAt !== null) {
          errors.push({
            field: "category",
            message: `Category "${match.name}" is archived. Restore it first.`,
          });
        } else if (match.type === row.type) {
          categoryId = match.id;
        } else {
          errors.push({
            field: "category",
            message: `"${match.name}" is an ${match.type} category, but this row is money ${row.type === "income" ? "in" : "out"}.`,
          });
        }
      }

      if (
        account &&
        row.transactionDate &&
        current.openingBalanceMode === "reject" &&
        row.transactionDate < account.openingBalanceDate
      ) {
        errors.push({
          field: "date",
          message: openingDateMessage(account.openingBalanceDate),
        });
      }

      let fingerprint: string | null = null;
      if (row.transactionDate && row.amount && row.type) {
        const base = [
          account?.id ?? current.organizationId,
          row.transactionDate,
          row.type,
          scaledAmount(row.amount).toString(),
          normalizeDescription(row.description),
        ].join("|");
        const occurrence = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, occurrence);
        fingerprint = sha256(`${base}|${occurrence}`);
      }

      const ruled =
        errors.length === 0
          ? applyImportRules(rules, current.accountId, row, categoryId)
          : { categoryId, ruleApplication: null };

      return {
        amount: row.amount,
        categoryId: ruled.categoryId,
        description: row.description,
        errors,
        fingerprint,
        notes: row.notes,
        raw: record.cells,
        rowNumber: record.rowNumber,
        ruleApplication: ruled.ruleApplication,
        status: errors.length > 0 ? "invalid" : "valid",
        transactionDate: row.transactionDate,
        type: row.type,
      };
    });

    const committed = await existingFingerprints(
      tx,
      current.organizationId,
      current.accountId,
      classified.flatMap((row) =>
        row.status === "valid" && row.fingerprint ? [row.fingerprint] : []
      )
    );
    for (const row of classified) {
      if (
        row.status === "valid" &&
        row.fingerprint &&
        committed.has(row.fingerprint)
      ) {
        row.status = "duplicate";
      }
    }

    await tx
      .delete(transactionImportRow)
      .where(eq(transactionImportRow.importId, importId));
    for (const batch of chunks(classified, CHUNK_SIZE)) {
      await tx.insert(transactionImportRow).values(
        batch.map((row) => ({
          ...row,
          importId,
          organizationId: current.organizationId,
        }))
      );
    }

    await tx
      .update(transactionImport)
      .set({
        ...(await rowCounts(tx, importId)),
        checksum,
        error: null,
        failedStatus: null,
        headers,
        status: "ready",
        validatedAt: new Date(),
      })
      .where(eq(transactionImport.id, importId));
  });
};

const setRowStatus = async (
  db: Database,
  rowIds: string[],
  status: TransactionImportRowStatus,
  errors?: TransactionImportRowError[]
): Promise<void> => {
  for (const batch of chunks(rowIds, CHUNK_SIZE)) {
    await db
      .update(transactionImportRow)
      .set(errors ? { errors, status } : { status })
      .where(inArray(transactionImportRow.id, batch));
  }
};

const extendOpeningDate = async (
  db: Database,
  organizationId: string,
  accountId: string,
  mode: OpeningBalanceMode,
  earliest: string
): Promise<void> => {
  const balanceBefore = await getAccountBalance(db, organizationId, accountId);
  await db
    .update(financialAccount)
    .set({ openingBalanceDate: earliest })
    .where(eq(financialAccount.id, accountId));
  if (mode !== "rebase") {
    return;
  }
  // Moving the date back pulls the earlier rows into the balance; offset them
  // so only rows on or after the old opening date move today's balance.
  const balanceAfter = await getAccountBalance(db, organizationId, accountId);
  await db
    .update(financialAccount)
    .set({
      openingBalance: sql`${financialAccount.openingBalance} + (${balanceBefore}::numeric - ${balanceAfter}::numeric)`,
    })
    .where(eq(financialAccount.id, accountId));
};

const commitImport = async (db: Database, importId: string): Promise<void> => {
  // oxlint-disable-next-line complexity
  await db.transaction(async (tx) => {
    const current = await lockImport(tx, importId);
    if (current?.status !== "committing") {
      return;
    }
    // Held to commit: a rebase reads the balance twice around moving the
    // opening date, and a posting committed in between would be offset away.
    const account = current.accountId
      ? await loadAccount(
          tx,
          current.organizationId,
          current.accountId,
          "update"
        )
      : null;
    const { defaultCurrency } = await householdSettings(
      tx,
      current.organizationId
    );
    const destination = account ?? { currencyCode: defaultCurrency, id: null };
    const rows = await tx
      .select()
      .from(transactionImportRow)
      .where(
        and(
          eq(transactionImportRow.importId, importId),
          eq(transactionImportRow.status, "valid")
        )
      )
      .orderBy(asc(transactionImportRow.rowNumber));

    const categoryIds = [
      ...new Set(
        rows.flatMap((row) => (row.categoryId ? [row.categoryId] : []))
      ),
    ];
    const categoryRows =
      categoryIds.length === 0
        ? []
        : await tx
            .select({ archivedAt: category.archivedAt, id: category.id })
            .from(category)
            .where(
              and(
                eq(category.organizationId, current.organizationId),
                inArray(category.id, categoryIds)
              )
            );
    const activeCategories = new Set(
      categoryRows
        .filter(({ archivedAt }) => archivedAt === null)
        .map(({ id }) => id)
    );
    const tagIds = [...new Set(rows.flatMap(rowTagIds))];
    const tagRows =
      tagIds.length === 0
        ? []
        : await tx
            .select({ id: tag.id })
            .from(tag)
            .where(
              and(
                eq(tag.organizationId, current.organizationId),
                inArray(tag.id, tagIds),
                isNull(tag.archivedAt)
              )
            );
    const activeTags = new Set(tagRows.map(({ id }) => id));

    const staleCategory: string[] = [];
    const staleTag: string[] = [];
    const beforeOpening: string[] = [];
    const ready = rows.filter((row) => {
      if (!row.categoryId || !activeCategories.has(row.categoryId)) {
        staleCategory.push(row.id);
        return false;
      }
      if (rowTagIds(row).some((id) => !activeTags.has(id))) {
        staleTag.push(row.id);
        return false;
      }
      if (
        account &&
        current.openingBalanceMode === "reject" &&
        row.transactionDate &&
        row.transactionDate < account.openingBalanceDate
      ) {
        beforeOpening.push(row.id);
        return false;
      }
      return true;
    });
    await setRowStatus(tx, staleCategory, "invalid", [
      {
        field: "category",
        message:
          "The category was archived after the preview. Restore it and import again.",
      },
    ]);
    await setRowStatus(tx, staleTag, "invalid", [
      {
        field: "tags",
        message:
          "A tag this row adds was archived after the preview. Restore it and import again.",
      },
    ]);
    if (account) {
      await setRowStatus(tx, beforeOpening, "invalid", [
        {
          field: "date",
          message: openingDateMessage(account.openingBalanceDate),
        },
      ]);
    }

    const duplicates: string[] = [];
    let earliest: string | null = null;
    for (const batch of chunks(ready, CHUNK_SIZE)) {
      const inserted = await tx
        .insert(financialTransaction)
        .values(
          batch.map((row) =>
            transactionInsertValues(current.organizationId, destination, {
              amount: row.amount ?? "0",
              categoryId: row.categoryId ?? "",
              createdByUserId: current.createdByUserId,
              importFingerprint: row.fingerprint,
              notes: row.notes,
              paidStatus: "paid",
              ruleApplication: row.ruleApplication,
              suggestionApplication: row.suggestionApplication,
              transactionDate: row.transactionDate ?? "",
            })
          )
        )
        // A fingerprint already on this account means the row was imported
        // before; skip it rather than fail the batch.
        .onConflictDoNothing()
        .returning({
          fingerprint: financialTransaction.importFingerprint,
          id: financialTransaction.id,
        });

      const byFingerprint = new Map(
        inserted.map(({ fingerprint, id }) => [fingerprint, id])
      );
      const links: { rowId: string; transactionId: string }[] = [];
      const tagLinks: {
        organizationId: string;
        tagId: string;
        transactionId: string;
      }[] = [];
      for (const row of batch) {
        const transactionId = byFingerprint.get(row.fingerprint);
        if (!transactionId) {
          duplicates.push(row.id);
          continue;
        }
        links.push({ rowId: row.id, transactionId });
        for (const tagId of rowTagIds(row)) {
          tagLinks.push({
            organizationId: current.organizationId,
            tagId,
            transactionId,
          });
        }
        if (
          row.transactionDate &&
          (!earliest || row.transactionDate < earliest)
        ) {
          earliest = row.transactionDate;
        }
      }
      if (links.length > 0) {
        const values = sql.join(
          links.map(
            ({ rowId, transactionId }) =>
              sql`(${rowId}::uuid, ${transactionId}::uuid)`
          ),
          sql`, `
        );
        await tx.execute(sql`
          UPDATE ${transactionImportRow}
          SET status = 'imported', transaction_id = link.transaction_id
          FROM (VALUES ${values}) AS link(row_id, transaction_id)
          WHERE ${transactionImportRow.id} = link.row_id
        `);
      }
      if (tagLinks.length > 0) {
        await tx.insert(financialTransactionTag).values(tagLinks);
      }
    }
    await setRowStatus(tx, duplicates, "duplicate");

    if (
      account &&
      current.openingBalanceMode !== "reject" &&
      earliest &&
      earliest < account.openingBalanceDate
    ) {
      await extendOpeningDate(
        tx,
        current.organizationId,
        account.id,
        current.openingBalanceMode,
        earliest
      );
    }

    await tx
      .update(transactionImport)
      .set({
        ...(await rowCounts(tx, importId)),
        committedAt: new Date(),
        error: null,
        failedStatus: null,
        status: "completed",
      })
      .where(eq(transactionImport.id, importId));
  });
};

// Failures are recorded, not thrown: a queue retry would find it `failed`.
export const processImport = async (
  db: Database,
  importId: string
): Promise<void> => {
  const [current] = await db
    .select({ status: transactionImport.status })
    .from(transactionImport)
    .where(eq(transactionImport.id, importId))
    .limit(1);

  if (!current) {
    log.warn({ action: "imports.process.missing", importId });
    return;
  }
  const { status } = current;
  if (status !== "validating" && status !== "committing") {
    log.info({ action: "imports.process.skipped", importId, status });
    return;
  }

  try {
    await (status === "validating"
      ? validateImport(db, importId)
      : commitImport(db, importId));
    log.info({ action: "imports.process.completed", importId, status });
  } catch (error) {
    log.error({
      action: "imports.process.failed",
      importId,
      ...parseError(error),
    });
    await db
      .update(transactionImport)
      .set({
        error:
          error instanceof ImportFailureError
            ? error.message
            : "Something went wrong while processing this import. Try again.",
        failedStatus: status,
        status: "failed",
      })
      .where(
        and(
          eq(transactionImport.id, importId),
          eq(transactionImport.status, status)
        )
      );
  }
};
