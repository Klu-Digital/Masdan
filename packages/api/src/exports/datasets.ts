import type { PermissionRequest } from "@masdan/auth/permissions";
import type { Database } from "@masdan/db";
import {
  category,
  creditCardStatement,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountOwner,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  financialTransfer,
  member,
  tag,
  transactionImport,
  transactionImportRow,
  user,
} from "@masdan/db/schema/index";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getAccountBalances } from "../accounts/balances";
import type { CsvColumn } from "./csv";
import { toCsv } from "./csv";

// Every joined table repeats the `organization_id` filter: a join on id alone
// would print another household's names if a foreign key ever crossed tenants.

export interface CsvExport {
  csv: string;
  rowCount: number;
}

export interface ExportDataset {
  build: (db: Database, organizationId: string) => Promise<CsvExport>;
  fileName: `${string}.csv`;
  permissions: PermissionRequest;
}

/** Separator for multi-value convenience columns; link datasets are canonical. */
const LIST_SEPARATOR = "; ";

const csvOf = <Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[]
): CsvExport => ({ csv: toCsv(columns, rows), rowCount: rows.length });

const counterpartAccount = alias(financialAccount, "counterpart_account");
const sourceAccount = alias(financialAccount, "source_account");
const destinationAccount = alias(financialAccount, "destination_account");
const sourcePosting = alias(financialTransaction, "source_posting");
const destinationPosting = alias(financialTransaction, "destination_posting");

const accountIn = (organizationId: string) =>
  and(
    eq(financialAccount.id, financialTransaction.accountId),
    eq(financialAccount.organizationId, organizationId)
  );

const categoryIn = (
  organizationId: string,
  categoryId:
    | typeof financialTransaction.categoryId
    | typeof financialTransactionSplit.categoryId
) =>
  and(eq(category.id, categoryId), eq(category.organizationId, organizationId));

/** At most one import row per transaction, so the join cannot fan out. */
const importProvenance = (db: Database, organizationId: string) =>
  db
    .selectDistinctOn([transactionImportRow.transactionId], {
      fileName: transactionImport.fileName,
      importId: transactionImportRow.importId,
      rowNumber: transactionImportRow.rowNumber,
      transactionId: transactionImportRow.transactionId,
    })
    .from(transactionImportRow)
    .innerJoin(
      transactionImport,
      and(
        eq(transactionImport.id, transactionImportRow.importId),
        eq(transactionImport.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(transactionImportRow.organizationId, organizationId),
        isNotNull(transactionImportRow.transactionId)
      )
    )
    .orderBy(transactionImportRow.transactionId, transactionImportRow.id)
    .as("import_provenance");

const transactions = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const provenance = importProvenance(db, organizationId);
  const rows = await db
    .select({
      accountId: financialTransaction.accountId,
      accountName: financialAccount.name,
      amount: financialTransaction.amount,
      archivedAt: financialTransaction.archivedAt,
      categoryId: financialTransaction.categoryId,
      categoryName: category.name,
      categoryType: category.type,
      counterpartAccountId: counterpartAccount.id,
      counterpartAccountName: counterpartAccount.name,
      createdAt: financialTransaction.createdAt,
      currencyCode: financialTransaction.currencyCode,
      id: financialTransaction.id,
      importFileName: provenance.fileName,
      importFingerprint: financialTransaction.importFingerprint,
      importId: provenance.importId,
      importSourceRow: provenance.rowNumber,
      notes: financialTransaction.notes,
      paidStatus: financialTransaction.paidStatus,
      splitCount: sql<number>`(
        select count(*)::int from ${financialTransactionSplit}
        where ${financialTransactionSplit.transactionId} = ${financialTransaction.id}
      )`,
      tagNames: sql<string | null>`(
        select string_agg(${tag.name}, ${LIST_SEPARATOR} order by lower(${tag.name}), ${tag.id})
        from ${financialTransactionTag}
        inner join ${tag} on ${tag.id} = ${financialTransactionTag.tagId}
          and ${tag.organizationId} = ${organizationId}
        where ${financialTransactionTag.transactionId} = ${financialTransaction.id}
      )`,
      transactionDate: financialTransaction.transactionDate,
      transferId: financialTransaction.transferId,
      transferSide: financialTransaction.transferSide,
      updatedAt: financialTransaction.updatedAt,
    })
    .from(financialTransaction)
    .leftJoin(financialAccount, accountIn(organizationId))
    .leftJoin(
      category,
      categoryIn(organizationId, financialTransaction.categoryId)
    )
    .leftJoin(
      financialTransfer,
      and(
        eq(financialTransfer.id, financialTransaction.transferId),
        eq(financialTransfer.organizationId, organizationId)
      )
    )
    .leftJoin(
      counterpartAccount,
      and(
        eq(
          counterpartAccount.id,
          sql`case when ${financialTransaction.transferSide} = 'source'
            then ${financialTransfer.destinationAccountId}
            else ${financialTransfer.sourceAccountId} end`
        ),
        eq(counterpartAccount.organizationId, organizationId)
      )
    )
    .leftJoin(provenance, eq(provenance.transactionId, financialTransaction.id))
    .where(eq(financialTransaction.organizationId, organizationId))
    .orderBy(
      asc(financialTransaction.transactionDate),
      asc(financialTransaction.id)
    );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "transaction_date", value: (row) => row.transactionDate },
    { header: "account_id", value: (row) => row.accountId },
    { header: "account_name", text: true, value: (row) => row.accountName },
    { header: "amount", value: (row) => row.amount },
    { header: "currency_code", value: (row) => row.currencyCode },
    { header: "category_id", value: (row) => row.categoryId },
    { header: "category_name", text: true, value: (row) => row.categoryName },
    { header: "category_type", value: (row) => row.categoryType },
    { header: "split_count", value: (row) => row.splitCount },
    { header: "tag_names", text: true, value: (row) => row.tagNames },
    { header: "paid_status", value: (row) => row.paidStatus },
    { header: "notes", text: true, value: (row) => row.notes },
    { header: "transfer_id", value: (row) => row.transferId },
    { header: "transfer_side", value: (row) => row.transferSide },
    {
      header: "transfer_counterpart_account_id",
      value: (row) => row.counterpartAccountId,
    },
    {
      header: "transfer_counterpart_account_name",
      text: true,
      value: (row) => row.counterpartAccountName,
    },
    { header: "import_id", value: (row) => row.importId },
    { header: "import_source_row", value: (row) => row.importSourceRow },
    {
      header: "import_file_name",
      text: true,
      value: (row) => row.importFileName,
    },
    { header: "import_fingerprint", value: (row) => row.importFingerprint },
    { header: "archived_at", value: (row) => row.archivedAt },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const transactionSplits = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select({
      accountId: financialTransaction.accountId,
      accountName: financialAccount.name,
      amount: financialTransactionSplit.amount,
      categoryId: financialTransactionSplit.categoryId,
      categoryName: category.name,
      categoryType: category.type,
      currencyCode: financialTransaction.currencyCode,
      id: financialTransactionSplit.id,
      sortOrder: financialTransactionSplit.sortOrder,
      transactionArchivedAt: financialTransaction.archivedAt,
      transactionDate: financialTransaction.transactionDate,
      transactionId: financialTransactionSplit.transactionId,
    })
    .from(financialTransactionSplit)
    .innerJoin(
      financialTransaction,
      and(
        eq(financialTransaction.id, financialTransactionSplit.transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .leftJoin(financialAccount, accountIn(organizationId))
    .leftJoin(
      category,
      categoryIn(organizationId, financialTransactionSplit.categoryId)
    )
    .orderBy(
      asc(financialTransaction.transactionDate),
      asc(financialTransaction.id),
      asc(financialTransactionSplit.sortOrder),
      asc(financialTransactionSplit.id)
    );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "transaction_id", value: (row) => row.transactionId },
    { header: "transaction_date", value: (row) => row.transactionDate },
    { header: "account_id", value: (row) => row.accountId },
    { header: "account_name", text: true, value: (row) => row.accountName },
    { header: "sort_order", value: (row) => row.sortOrder },
    { header: "amount", value: (row) => row.amount },
    { header: "currency_code", value: (row) => row.currencyCode },
    { header: "category_id", value: (row) => row.categoryId },
    { header: "category_name", text: true, value: (row) => row.categoryName },
    { header: "category_type", value: (row) => row.categoryType },
    {
      header: "transaction_archived_at",
      value: (row) => row.transactionArchivedAt,
    },
  ]);
};

const transactionTags = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select({
      tagArchivedAt: tag.archivedAt,
      tagId: financialTransactionTag.tagId,
      tagName: tag.name,
      transactionDate: financialTransaction.transactionDate,
      transactionId: financialTransactionTag.transactionId,
    })
    .from(financialTransactionTag)
    .innerJoin(
      financialTransaction,
      and(
        eq(financialTransaction.id, financialTransactionTag.transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .innerJoin(
      tag,
      and(
        eq(tag.id, financialTransactionTag.tagId),
        eq(tag.organizationId, organizationId)
      )
    )
    .orderBy(
      asc(financialTransaction.transactionDate),
      asc(financialTransaction.id),
      asc(sql`lower(${tag.name})`),
      asc(tag.id)
    );

  return csvOf(rows, [
    { header: "transaction_id", value: (row) => row.transactionId },
    { header: "transaction_date", value: (row) => row.transactionDate },
    { header: "tag_id", value: (row) => row.tagId },
    { header: "tag_name", text: true, value: (row) => row.tagName },
    { header: "tag_archived_at", value: (row) => row.tagArchivedAt },
  ]);
};

const accounts = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select()
    .from(financialAccount)
    .where(eq(financialAccount.organizationId, organizationId))
    .orderBy(
      asc(financialAccount.accountClass),
      asc(financialAccount.name),
      asc(financialAccount.id)
    );

  const owners = await db
    .select({
      accountId: financialAccountOwner.financialAccountId,
      memberId: member.id,
      name: user.name,
    })
    .from(financialAccountOwner)
    .innerJoin(
      financialAccount,
      and(
        eq(financialAccount.id, financialAccountOwner.financialAccountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .innerJoin(
      member,
      and(
        eq(member.id, financialAccountOwner.memberId),
        eq(member.organizationId, organizationId)
      )
    )
    .innerJoin(user, eq(user.id, member.userId))
    .orderBy(asc(user.name), asc(member.id));

  const ownersByAccount = new Map<string, { ids: string[]; names: string[] }>();
  for (const owner of owners) {
    const entry = ownersByAccount.get(owner.accountId) ?? {
      ids: [],
      names: [],
    };
    entry.ids.push(owner.memberId);
    entry.names.push(owner.name);
    ownersByAccount.set(owner.accountId, entry);
  }

  const balances = await getAccountBalances(
    db,
    organizationId,
    rows.map((row) => row.id)
  );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "name", text: true, value: (row) => row.name },
    { header: "account_class", value: (row) => row.accountClass },
    { header: "account_type", value: (row) => row.accountType },
    { header: "liquidity", value: (row) => row.liquidity },
    { header: "currency_code", value: (row) => row.currencyCode },
    { header: "include_in_net_worth", value: (row) => row.includeInNetWorth },
    { header: "opening_balance", value: (row) => row.openingBalance },
    { header: "opening_balance_date", value: (row) => row.openingBalanceDate },
    {
      header: "current_balance",
      value: (row) => balances.get(row.id) ?? row.openingBalance,
    },
    { header: "institution", text: true, value: (row) => row.institution },
    { header: "credit_limit", value: (row) => row.creditLimit },
    { header: "card_network", text: true, value: (row) => row.cardNetwork },
    { header: "card_last_four", value: (row) => row.cardLastFour },
    {
      header: "statement_closing_day",
      value: (row) => row.statementClosingDay,
    },
    { header: "payment_due_day", value: (row) => row.paymentDueDay },
    {
      header: "owner_member_ids",
      value: (row) => ownersByAccount.get(row.id)?.ids.join(LIST_SEPARATOR),
    },
    {
      header: "owner_names",
      text: true,
      value: (row) => ownersByAccount.get(row.id)?.names.join(LIST_SEPARATOR),
    },
    { header: "color", value: (row) => row.color },
    { header: "icon", value: (row) => row.icon },
    { header: "notes", text: true, value: (row) => row.notes },
    { header: "archived_at", value: (row) => row.archivedAt },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const accountBalanceSnapshots = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select({
      accountArchivedAt: financialAccount.archivedAt,
      accountId: financialAccountBalanceSnapshot.accountId,
      accountName: financialAccount.name,
      balance: financialAccountBalanceSnapshot.balance,
      createdAt: financialAccountBalanceSnapshot.createdAt,
      currencyCode: financialAccount.currencyCode,
      effectiveDate: financialAccountBalanceSnapshot.effectiveDate,
      id: financialAccountBalanceSnapshot.id,
      importReference: financialAccountBalanceSnapshot.importReference,
      source: financialAccountBalanceSnapshot.source,
    })
    .from(financialAccountBalanceSnapshot)
    .innerJoin(
      financialAccount,
      and(
        eq(financialAccount.id, financialAccountBalanceSnapshot.accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .orderBy(
      asc(financialAccountBalanceSnapshot.effectiveDate),
      asc(financialAccountBalanceSnapshot.id)
    );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "effective_date", value: (row) => row.effectiveDate },
    { header: "account_id", value: (row) => row.accountId },
    { header: "account_name", text: true, value: (row) => row.accountName },
    { header: "balance", value: (row) => row.balance },
    { header: "currency_code", value: (row) => row.currencyCode },
    { header: "source", value: (row) => row.source },
    {
      header: "import_reference",
      text: true,
      value: (row) => row.importReference,
    },
    { header: "account_archived_at", value: (row) => row.accountArchivedAt },
    { header: "created_at", value: (row) => row.createdAt },
  ]);
};

const transfers = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select({
      createdAt: financialTransfer.createdAt,
      destinationAccountId: financialTransfer.destinationAccountId,
      destinationAccountName: destinationAccount.name,
      destinationAmount: financialTransfer.destinationAmount,
      destinationCurrencyCode: destinationAccount.currencyCode,
      destinationTransactionId: destinationPosting.id,
      id: financialTransfer.id,
      notes: financialTransfer.notes,
      sourceAccountId: financialTransfer.sourceAccountId,
      sourceAccountName: sourceAccount.name,
      sourceAmount: financialTransfer.sourceAmount,
      sourceCurrencyCode: sourceAccount.currencyCode,
      sourceTransactionId: sourcePosting.id,
      transactionDate: financialTransfer.transactionDate,
      updatedAt: financialTransfer.updatedAt,
    })
    .from(financialTransfer)
    .leftJoin(
      sourceAccount,
      and(
        eq(sourceAccount.id, financialTransfer.sourceAccountId),
        eq(sourceAccount.organizationId, organizationId)
      )
    )
    .leftJoin(
      destinationAccount,
      and(
        eq(destinationAccount.id, financialTransfer.destinationAccountId),
        eq(destinationAccount.organizationId, organizationId)
      )
    )
    .leftJoin(
      sourcePosting,
      and(
        eq(sourcePosting.transferId, financialTransfer.id),
        eq(sourcePosting.transferSide, "source"),
        eq(sourcePosting.organizationId, organizationId)
      )
    )
    .leftJoin(
      destinationPosting,
      and(
        eq(destinationPosting.transferId, financialTransfer.id),
        eq(destinationPosting.transferSide, "destination"),
        eq(destinationPosting.organizationId, organizationId)
      )
    )
    .where(eq(financialTransfer.organizationId, organizationId))
    .orderBy(asc(financialTransfer.transactionDate), asc(financialTransfer.id));

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "transaction_date", value: (row) => row.transactionDate },
    { header: "source_account_id", value: (row) => row.sourceAccountId },
    {
      header: "source_account_name",
      text: true,
      value: (row) => row.sourceAccountName,
    },
    { header: "source_amount", value: (row) => row.sourceAmount },
    { header: "source_currency_code", value: (row) => row.sourceCurrencyCode },
    {
      header: "source_transaction_id",
      value: (row) => row.sourceTransactionId,
    },
    {
      header: "destination_account_id",
      value: (row) => row.destinationAccountId,
    },
    {
      header: "destination_account_name",
      text: true,
      value: (row) => row.destinationAccountName,
    },
    { header: "destination_amount", value: (row) => row.destinationAmount },
    {
      header: "destination_currency_code",
      value: (row) => row.destinationCurrencyCode,
    },
    {
      header: "destination_transaction_id",
      value: (row) => row.destinationTransactionId,
    },
    { header: "notes", text: true, value: (row) => row.notes },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const creditCardStatements = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select({
      accountArchivedAt: financialAccount.archivedAt,
      accountId: creditCardStatement.accountId,
      accountName: financialAccount.name,
      createdAt: creditCardStatement.createdAt,
      currencyCode: financialAccount.currencyCode,
      dueDate: creditCardStatement.dueDate,
      id: creditCardStatement.id,
      minimumAmountDue: creditCardStatement.minimumAmountDue,
      periodEnd: creditCardStatement.periodEnd,
      periodStart: creditCardStatement.periodStart,
      statementBalance: creditCardStatement.statementBalance,
      statementDate: creditCardStatement.statementDate,
      updatedAt: creditCardStatement.updatedAt,
    })
    .from(creditCardStatement)
    .innerJoin(
      financialAccount,
      and(
        eq(financialAccount.id, creditCardStatement.accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .where(eq(creditCardStatement.organizationId, organizationId))
    .orderBy(
      asc(creditCardStatement.statementDate),
      asc(creditCardStatement.id)
    );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "statement_date", value: (row) => row.statementDate },
    { header: "account_id", value: (row) => row.accountId },
    { header: "account_name", text: true, value: (row) => row.accountName },
    { header: "period_start", value: (row) => row.periodStart },
    { header: "period_end", value: (row) => row.periodEnd },
    { header: "due_date", value: (row) => row.dueDate },
    { header: "statement_balance", value: (row) => row.statementBalance },
    { header: "minimum_amount_due", value: (row) => row.minimumAmountDue },
    { header: "currency_code", value: (row) => row.currencyCode },
    { header: "account_archived_at", value: (row) => row.accountArchivedAt },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const categories = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select()
    .from(category)
    .where(eq(category.organizationId, organizationId))
    .orderBy(
      asc(category.type),
      asc(category.sortOrder),
      asc(category.name),
      asc(category.id)
    );

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "name", text: true, value: (row) => row.name },
    { header: "type", value: (row) => row.type },
    { header: "color", value: (row) => row.color },
    { header: "icon", value: (row) => row.icon },
    { header: "sort_order", value: (row) => row.sortOrder },
    { header: "archived_at", value: (row) => row.archivedAt },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const tags = async (
  db: Database,
  organizationId: string
): Promise<CsvExport> => {
  const rows = await db
    .select()
    .from(tag)
    .where(eq(tag.organizationId, organizationId))
    .orderBy(asc(sql`lower(${tag.name})`), asc(tag.id));

  return csvOf(rows, [
    { header: "id", value: (row) => row.id },
    { header: "name", text: true, value: (row) => row.name },
    { header: "color", value: (row) => row.color },
    { header: "archived_at", value: (row) => row.archivedAt },
    { header: "created_at", value: (row) => row.createdAt },
    { header: "updated_at", value: (row) => row.updatedAt },
  ]);
};

const accountRead: PermissionRequest = { financialAccount: ["read"] };
const transactionRead: PermissionRequest = { transaction: ["read"] };

/** Keys are the router's procedure names; columns are in `README.md`. */
export const EXPORT_DATASETS = {
  accountBalanceSnapshots: {
    build: accountBalanceSnapshots,
    fileName: "account_balance_snapshots.csv",
    permissions: accountRead,
  },
  accounts: {
    build: accounts,
    fileName: "accounts.csv",
    permissions: accountRead,
  },
  categories: {
    build: categories,
    fileName: "categories.csv",
    permissions: { category: ["read"] },
  },
  creditCardStatements: {
    build: creditCardStatements,
    fileName: "credit_card_statements.csv",
    permissions: accountRead,
  },
  tags: {
    build: tags,
    fileName: "tags.csv",
    permissions: { tag: ["read"] },
  },
  transactionSplits: {
    build: transactionSplits,
    fileName: "transaction_splits.csv",
    permissions: transactionRead,
  },
  transactionTags: {
    build: transactionTags,
    fileName: "transaction_tags.csv",
    permissions: transactionRead,
  },
  transactions: {
    build: transactions,
    fileName: "transactions.csv",
    permissions: transactionRead,
  },
  transfers: {
    build: transfers,
    fileName: "transfers.csv",
    permissions: transactionRead,
  },
} as const satisfies Record<string, ExportDataset>;

export type ExportDatasetName = keyof typeof EXPORT_DATASETS;
