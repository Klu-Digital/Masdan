import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { money, timestamps, timestamptz } from "./columns";
import { financialAccount } from "./financial-accounts";

export const savingsGoal = pgTable(
  "savings_goal",
  {
    accountId: uuid("account_id").notNull(),
    archivedAt: timestamptz("archived_at"),
    completedAt: timestamptz("completed_at"),
    ...timestamps(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** In the tracking account's currency. */
    targetAmount: money("target_amount").notNull(),
    targetDate: date("target_date", { mode: "string" }),
  },
  (table) => [
    // Accounts are archived, never deleted, so a goal keeps pointing at the
    // balance it was measured by.
    foreignKey({
      columns: [table.organizationId, table.accountId],
      foreignColumns: [financialAccount.organizationId, financialAccount.id],
      name: "savings_goal_account_id_fkey",
    }).onDelete("restrict"),
    check("savings_goal_positive_target_chk", sql`${table.targetAmount} > 0`),
    index("savings_goal_organization_idx").on(
      table.organizationId,
      table.archivedAt
    ),
    index("savings_goal_account_idx").on(table.accountId),
  ]
);
