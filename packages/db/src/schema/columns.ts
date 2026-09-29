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

export const rate = (name: string) =>
  numeric(name, { precision: 30, scale: 12 });
