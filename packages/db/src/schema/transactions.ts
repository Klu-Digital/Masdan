import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { currency } from "./finance";
import { financialAccount } from "./financial-accounts";
import { tag } from "./tags";

const money = (name: string) => numeric(name, { precision: 30, scale: 6 });

export const paidStatusEnum = pgEnum("paid_status", ["paid", "unpaid"]);

export const financialTransaction = pgTable(
  "financial_transaction",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    archivedAt: timestamp("archived_at"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    notes: text("notes"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    paidStatus: paidStatusEnum("paid_status").default("paid").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("financial_transaction_organization_date_idx").on(
      table.organizationId,
      table.archivedAt,
      table.transactionDate
    ),
    index("financial_transaction_account_date_idx").on(
      table.accountId,
      table.archivedAt,
      table.transactionDate
    ),
    index("financial_transaction_category_idx").on(table.categoryId),
    index("financial_transaction_organization_amount_idx").on(
      table.organizationId,
      table.archivedAt,
      table.amount,
      table.id
    ),
  ]
);

export const financialTransactionSplit = pgTable(
  "financial_transaction_split",
  {
    amount: money("amount").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    sortOrder: integer("sort_order").notNull(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financialTransaction.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("financial_transaction_split_transaction_order_uidx").on(
      table.transactionId,
      table.sortOrder
    ),
    index("financial_transaction_split_category_idx").on(table.categoryId),
  ]
);

export const financialTransactionTag = pgTable(
  "financial_transaction_tag",
  {
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => financialTransaction.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
    index("financial_transaction_tag_tag_transaction_idx").on(
      table.tagId,
      table.transactionId
    ),
  ]
);
