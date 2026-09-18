import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { member, organization } from "./auth";
import { currency } from "./finance";

const money = (name: string) => numeric(name, { precision: 30, scale: 6 });

export const financialAccount = pgTable(
  "financial_account",
  {
    accountClass: text("account_class").notNull(),
    accountType: text("account_type").notNull(),
    archivedAt: timestamp("archived_at"),
    cardLastFour: text("card_last_four"),
    cardNetwork: text("card_network"),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    creditLimit: money("credit_limit"),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    icon: text("icon"),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    includeInNetWorth: boolean("include_in_net_worth").default(true).notNull(),
    institution: text("institution"),
    liquidity: text("liquidity"),
    name: text("name").notNull(),
    notes: text("notes"),
    openingBalance: money("opening_balance").default("0").notNull(),
    openingBalanceDate: date("opening_balance_date", { mode: "string" })
      .defaultNow()
      .notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    paymentDueDay: smallint("payment_due_day"),
    statementClosingDay: smallint("statement_closing_day"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("financial_account_organization_archived_idx").on(
      table.organizationId,
      table.archivedAt
    ),
    index("financial_account_organization_type_idx").on(
      table.organizationId,
      table.accountClass,
      table.accountType
    ),
  ]
);

export const financialAccountOwner = pgTable(
  "financial_account_owner",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    financialAccountId: uuid("financial_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("financial_account_owner_account_member_uidx").on(
      table.financialAccountId,
      table.memberId
    ),
    index("financial_account_owner_member_idx").on(table.memberId),
  ]
);

export const financialAccountBalanceSnapshot = pgTable(
  "financial_account_balance_snapshot",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    balance: money("balance").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    importReference: text("import_reference"),
    source: text("source").default("manual").notNull(),
  },
  (table) => [
    index("financial_account_balance_snapshot_account_date_idx").on(
      table.accountId,
      table.effectiveDate
    ),
  ]
);
