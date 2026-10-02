import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { timestamptz } from "./columns";

export interface AskStoredAction {
  description: string;
  input: string;
  tool: string;
}

export interface AskObservation {
  hash: string;
  input: string;
  tool: string;
}

export interface AskOutcome {
  result: string;
  tool: string;
}

// Postgres makes confirmation survive restarts and dedupes concurrent retries.
export const askTurn = pgTable(
  "ask_turn",
  {
    actions: jsonb("actions").$type<AskStoredAction[]>(),
    appliedAt: timestamptz("applied_at"),
    cancelledAt: timestamptz("cancelled_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    observations: jsonb("observations").$type<AskObservation[]>().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    outcomes: jsonb("outcomes").$type<AskOutcome[]>(),
    previousId: uuid("previous_id"),
    question: text("question").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("ask_turn_organization_id_id_unique").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      columns: [table.organizationId, table.previousId],
      foreignColumns: [table.organizationId, table.id],
      name: "ask_turn_previous_id_fkey",
    }).onDelete("restrict"),
    index("ask_turn_user_household_idx").on(table.userId, table.organizationId),
  ]
);
