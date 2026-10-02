import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { numeric, timestamp } from "drizzle-orm/pg-core";

/** An instant. With time zone so the stored value never depends on the session's `TimeZone`. */
export const timestamptz = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const timestamps = () => ({
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Amounts; the API scales them to BigInt, see `packages/api/src/shared/money.ts`. */
export const money = (name: string) =>
  numeric(name, { precision: 30, scale: 6 });

/** Percentages, at the ledger's scale so `scaledAmount` reads them: `3.25` is 3.25%. */
export const percent = (name: string) =>
  numeric(name, { precision: 12, scale: 6 });

export const rate = (name: string) =>
  numeric(name, { precision: 30, scale: 12 });

// Text plus CHECK, not a pg enum: `ADD VALUE` can't run in a transaction.
export const oneOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} IN (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `
  )})`;
