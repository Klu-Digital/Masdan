import { sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
  (table) => [primaryKey({ columns: [table.transactionId, table.tagId] })]
);
