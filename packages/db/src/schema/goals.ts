import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { financialAccount } from "./financial-accounts";

/**
 * A savings target measured by one asset account's ledger balance. Progress
 * is never stored; the lifecycle is derived from the two timestamps.
 */
export const savingsGoal = pgTable(
  "savings_goal",
  {
    /**
     * No `onDelete`: accounts are archived, never deleted, so a goal keeps
     * pointing at the balance it was measured by.
     */
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id),
    archivedAt: timestamp("archived_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** In the tracking account's currency. */
    targetAmount: numeric("target_amount", {
      precision: 30,
      scale: 6,
    }).notNull(),
    targetDate: date("target_date", { mode: "string" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("savings_goal_positive_target_chk", sql`${table.targetAmount} > 0`),
    index("savings_goal_organization_idx").on(
      table.organizationId,
      table.archivedAt
    ),
    index("savings_goal_account_idx").on(table.accountId),
  ]
);
