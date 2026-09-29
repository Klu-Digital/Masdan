import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { category } from "./categories";
import { money, timestamps } from "./columns";
import { financialAccount } from "./financial-accounts";
import { tag } from "./tags";

export const transactionRuleTextOperators = [
  "contains",
  "equals",
  "startsWith",
] as const;
export type TransactionRuleTextOperator =
  (typeof transactionRuleTextOperators)[number];

export const transactionRuleTypes = ["income", "expense"] as const;
export type TransactionRuleType = (typeof transactionRuleTypes)[number];

/** Every non-null condition must hold for a rule to match. */
export interface TransactionRuleConditions {
  accountId: string | null;
  amountMax: string | null;
  amountMin: string | null;
  text: { operator: TransactionRuleTextOperator; value: string } | null;
  type: TransactionRuleType | null;
}

/**
 * What a rule matched on and changed, captured when it ran so a later edit or
 * deletion of the rule doesn't rewrite the explanation.
 */
export interface TransactionRuleApplication {
  categoryId: string | null;
  conditions: TransactionRuleConditions;
  ruleId: string;
  ruleName: string;
  tagIds: string[];
}

/**
 * A household's categorization rule. Rules run in `position` order and the
 * first enabled match wins; `id` breaks ties so order never depends on the
 * heap.
 */
export const transactionRule = pgTable(
  "transaction_rule",
  {
    ...timestamps(),
    enabled: boolean("enabled").default(true).notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    matchAccountId: uuid("match_account_id").references(
      () => financialAccount.id,
      { onDelete: "cascade" }
    ),
    matchAmountMax: money("match_amount_max"),
    matchAmountMin: money("match_amount_min"),
    matchText: text("match_text"),
    matchTextOperator: text("match_text_operator", {
      enum: transactionRuleTextOperators,
    }),
    matchType: text("match_type", { enum: transactionRuleTypes }),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    setCategoryId: uuid("set_category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("transaction_rule_organization_position_idx").on(
      table.organizationId,
      table.position,
      table.id
    ),
    check(
      "transaction_rule_text_operator_chk",
      sql`(${table.matchText} IS NULL) = (${table.matchTextOperator} IS NULL)`
    ),
    check(
      "transaction_rule_has_condition_chk",
      sql`num_nonnulls(${table.matchText}, ${table.matchType}, ${table.matchAccountId}, ${table.matchAmountMin}, ${table.matchAmountMax}) > 0`
    ),
    check(
      "transaction_rule_amount_range_chk",
      sql`(${table.matchAmountMin} IS NULL OR ${table.matchAmountMin} > 0)
        AND (${table.matchAmountMax} IS NULL OR ${table.matchAmountMax} > 0)
        AND (${table.matchAmountMin} IS NULL OR ${table.matchAmountMax} IS NULL OR ${table.matchAmountMin} <= ${table.matchAmountMax})`
    ),
  ]
);

/** Tags a matching rule adds; it never removes a transaction's other tags. */
export const transactionRuleTag = pgTable(
  "transaction_rule_tag",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => transactionRule.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.tagId] }),
    index("transaction_rule_tag_tag_idx").on(table.tagId),
  ]
);
