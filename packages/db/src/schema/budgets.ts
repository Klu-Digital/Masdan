import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { money, timestamps } from "./columns";
import { currency } from "./finance";

/**
 * A planned monthly spend for one expense category. Actuals are never stored:
 * they are summed from the ledger when read. `month` is the first calendar day
 * of the household-local month.
 */
export const categoryBudget = pgTable(
  "category_budget",
  {
    amount: money("amount").notNull(),
    /**
     * No `onDelete`: categories are archived, never deleted, so a month's plan
     * outlives the category it was made for.
     */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    ...timestamps(),
    /** The household currency when the budget was set; actuals match it. */
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    month: date("month", { mode: "string" }).notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("category_budget_positive_amount_chk", sql`${table.amount} > 0`),
    check(
      "category_budget_month_start_chk",
      sql`EXTRACT(DAY FROM ${table.month}) = 1`
    ),
    // Month before category: the same index serves "every budget this month".
    uniqueIndex("category_budget_organization_month_category_uidx").on(
      table.organizationId,
      table.month,
      table.categoryId
    ),
    index("category_budget_category_idx").on(table.categoryId),
  ]
);
