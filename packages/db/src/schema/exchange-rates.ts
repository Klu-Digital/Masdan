import { sql } from "drizzle-orm";
import {
  check,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { currency } from "./finance";

/** Public feed reference data, not tenant data: no organizationId. */
export const exchangeRate = pgTable(
  "exchange_rate",
  {
    baseCurrency: text("base_currency")
      .notNull()
      .references(() => currency.code),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    quoteCurrency: text("quote_currency")
      .notNull()
      .references(() => currency.code),
    rate: numeric("rate", { precision: 30, scale: 12 }).notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    check("exchange_rate_positive_chk", sql`${table.rate} > 0`),
    uniqueIndex("exchange_rate_source_pair_date_uidx").on(
      table.source,
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate
    ),
  ]
);

/** Household manual fallback: toCurrency units per 1 fromCurrency. */
export const householdExchangeRate = pgTable(
  "household_exchange_rate",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    fromCurrency: text("from_currency")
      .notNull()
      .references(() => currency.code),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    rate: numeric("rate", { precision: 30, scale: 12 }).notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    toCurrency: text("to_currency")
      .notNull()
      .references(() => currency.code),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("household_exchange_rate_positive_chk", sql`${table.rate} > 0`),
    check(
      "household_exchange_rate_pair_chk",
      sql`${table.fromCurrency} <> ${table.toCurrency}`
    ),
    uniqueIndex("household_exchange_rate_pair_date_uidx").on(
      table.organizationId,
      table.fromCurrency,
      table.toCurrency,
      table.rateDate
    ),
  ]
);
