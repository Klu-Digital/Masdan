import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CALCULATION_BASES,
  CREDIT_FREQUENCIES,
  DAY_COUNT_BASES,
  INTEREST_PRODUCT_TYPES,
  TERM_UNITS,
  TIER_MODES,
} from "../reference/interest";
import type { InterestTier } from "../reference/interest";
import { organization } from "./auth";
import { money, oneOf, percent, timestamps, timestamptz } from "./columns";
import { currency } from "./finance";
import { financialAccount } from "./financial-accounts";
import { financialInstitution } from "./institutions";
import { financialTransaction } from "./transactions";

export const interestProduct = pgTable(
  "interest_product",
  {
    aliases: text("aliases").array().default([]).notNull(),
    channelInstitutionId: uuid("channel_institution_id").references(
      () => financialInstitution.id,
      { onDelete: "restrict" }
    ),
    ...timestamps(),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => financialInstitution.id, { onDelete: "restrict" }),
    key: text("key").notNull().unique("interest_product_key_key"),
    name: text("name").notNull(),
    notes: text("notes"),
    productType: text("product_type", {
      enum: INTEREST_PRODUCT_TYPES,
    }).notNull(),
    sourceUrl: text("source_url"),
  },
  (table) => [
    check(
      "interest_product_type_chk",
      oneOf(table.productType, INTEREST_PRODUCT_TYPES)
    ),
    index("interest_product_institution_idx").on(table.institutionId),
  ]
);

/** The columns of `InterestTerms`; nullable where an account follows a preset. */
const termsColumns = () => ({
  bonusAnnualRate: percent("bonus_annual_rate"),
  calculationBasis: text("calculation_basis", { enum: CALCULATION_BASES }),
  conditionSummary: text("condition_summary"),
  creditFrequency: text("credit_frequency", { enum: CREDIT_FREQUENCIES }),
  dayCountBasis: text("day_count_basis", { enum: DAY_COUNT_BASES }),
  interestCapBalance: money("interest_cap_balance"),
  minimumBalance: money("minimum_balance"),
  tierMode: text("tier_mode", { enum: TIER_MODES }),
  tiers: jsonb("tiers").$type<InterestTier[]>(),
  withholdingTaxRate: percent("withholding_tax_rate"),
});

interface TermsTable {
  calculationBasis: AnyPgColumn;
  creditFrequency: AnyPgColumn;
  dayCountBasis: AnyPgColumn;
  tierMode: AnyPgColumn;
  tiers: AnyPgColumn;
  withholdingTaxRate: AnyPgColumn;
}

const termsPresent = (table: TermsTable) =>
  sql`(${table.tierMode} IS NOT NULL AND ${table.tiers} IS NOT NULL AND ${table.calculationBasis} IS NOT NULL AND ${table.dayCountBasis} IS NOT NULL AND ${table.creditFrequency} IS NOT NULL AND ${table.withholdingTaxRate} IS NOT NULL)`;

const termsAbsent = (table: TermsTable) =>
  sql`(${table.tierMode} IS NULL AND ${table.tiers} IS NULL AND ${table.calculationBasis} IS NULL AND ${table.dayCountBasis} IS NULL AND ${table.creditFrequency} IS NULL AND ${table.withholdingTaxRate} IS NULL)`;

const termsChecks = (name: string, table: TermsTable) => [
  check(
    `${name}_tier_mode_chk`,
    sql`${table.tierMode} IS NULL OR ${oneOf(table.tierMode, TIER_MODES)}`
  ),
  check(
    `${name}_calculation_basis_chk`,
    sql`${table.calculationBasis} IS NULL OR ${oneOf(table.calculationBasis, CALCULATION_BASES)}`
  ),
  check(
    `${name}_day_count_basis_chk`,
    sql`${table.dayCountBasis} IS NULL OR ${oneOf(table.dayCountBasis, DAY_COUNT_BASES)}`
  ),
  check(
    `${name}_credit_frequency_chk`,
    sql`${table.creditFrequency} IS NULL OR ${oneOf(table.creditFrequency, CREDIT_FREQUENCIES)}`
  ),
];

/**
 * A product's rates from `effective_from` to `effective_to`, one row per tenor
 * for a time deposit. Never updated once shipped: a rate change is a new row,
 * so a projection over last month still reads last month's rate.
 */
export const interestRateSchedule = pgTable(
  "interest_rate_schedule",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    /** `null`: in effect when the source was checked, start not published. */
    effectiveFrom: date("effective_from", { mode: "string" }),
    effectiveTo: date("effective_to", { mode: "string" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    productId: uuid("product_id")
      .notNull()
      .references(() => interestProduct.id, { onDelete: "restrict" }),
    sourceCheckedAt: date("source_checked_at", { mode: "string" }),
    sourceUrl: text("source_url"),
    termCount: smallint("term_count"),
    termUnit: text("term_unit", { enum: TERM_UNITS }),
    ...termsColumns(),
  },
  (table) => [
    ...termsChecks("interest_rate_schedule", table),
    check("interest_rate_schedule_terms_chk", termsPresent(table)),
    check(
      "interest_rate_schedule_term_chk",
      sql`(${table.termCount} IS NULL) = (${table.termUnit} IS NULL) AND (${table.termUnit} IS NULL OR (${oneOf(table.termUnit, TERM_UNITS)} AND ${table.termCount} > 0))`
    ),
    check(
      "interest_rate_schedule_period_chk",
      sql`${table.effectiveFrom} IS NULL OR ${table.effectiveTo} IS NULL OR ${table.effectiveFrom} <= ${table.effectiveTo}`
    ),
    unique("interest_rate_schedule_version_key")
      .on(table.productId, table.termCount, table.termUnit, table.effectiveFrom)
      .nullsNotDistinct(),
  ]
);

/** What an account earns: a preset it was chosen from, and its placement. */
export const financialAccountInterest = pgTable(
  "financial_account_interest",
  {
    accountId: uuid("account_id").notNull(),
    /** Post each estimated credit to the ledger on its credit date. */
    autoPost: boolean("auto_post").default(true).notNull(),
    bonusEligible: boolean("bonus_eligible").default(false).notNull(),
    ...timestamps(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    maturityDate: date("maturity_date", { mode: "string" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => interestProduct.id, {
      onDelete: "restrict",
    }),
    startDate: date("start_date", { mode: "string" }),
    termCount: smallint("term_count"),
    termUnit: text("term_unit", { enum: TERM_UNITS }),
  },
  (table) => [
    unique("financial_account_interest_account_key").on(
      table.organizationId,
      table.accountId
    ),
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "financial_account_interest_account_id_fkey",
    }).onDelete("restrict"),
    check(
      "financial_account_interest_term_chk",
      sql`(${table.termCount} IS NULL) = (${table.termUnit} IS NULL) AND (${table.termUnit} IS NULL OR (${oneOf(table.termUnit, TERM_UNITS)} AND ${table.termCount} > 0))`
    ),
    check(
      "financial_account_interest_maturity_chk",
      sql`${table.maturityDate} IS NULL OR ${table.startDate} IS NULL OR ${table.startDate} < ${table.maturityDate}`
    ),
  ]
);

/**
 * The account's own rate history. A row either follows its product's
 * schedules or carries terms of its own (a booked time deposit, a custom
 * rate); an edit closes the open row rather than rewriting it.
 */
export const financialAccountInterestRate = pgTable(
  "financial_account_interest_rate",
  {
    accountId: uuid("account_id").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    followsPreset: boolean("follows_preset").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ...termsColumns(),
  },
  (table) => [
    ...termsChecks("financial_account_interest_rate", table),
    check(
      "financial_account_interest_rate_terms_chk",
      sql`CASE WHEN ${table.followsPreset} THEN ${termsAbsent(table)} ELSE ${termsPresent(table)} END`
    ),
    check(
      "financial_account_interest_rate_period_chk",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveFrom} <= ${table.effectiveTo}`
    ),
    // Removing an account's interest takes its rate history with it.
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [
        financialAccountInterest.organizationId,
        financialAccountInterest.accountId,
      ],
      name: "financial_account_interest_rate_account_id_fkey",
    }).onDelete("cascade"),
    unique("financial_account_interest_rate_version_key").on(
      table.accountId,
      table.effectiveFrom
    ),
  ]
);

/**
 * One credit period the worker has posted. The unique (account, credit date)
 * key makes a retried or overlapping run a no-op, and the latest `period_end`
 * is where the next run starts, so an archived interest transaction is never
 * posted again. `transaction_id` is null for a period that earned nothing.
 */
export const interestCredit = pgTable(
  "interest_credit",
  {
    accountId: uuid("account_id").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    creditDate: date("credit_date", { mode: "string" }).notNull(),
    gross: money("gross").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    net: money("net").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    tax: money("tax").notNull(),
    transactionId: uuid("transaction_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "interest_credit_account_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [
        financialTransaction.organizationId,
        financialTransaction.id,
      ],
      name: "interest_credit_transaction_id_fkey",
    }).onDelete("restrict"),
    unique("interest_credit_account_date_key").on(
      table.accountId,
      table.creditDate
    ),
    check(
      "interest_credit_period_chk",
      sql`${table.periodStart} <= ${table.periodEnd}`
    ),
  ]
);
