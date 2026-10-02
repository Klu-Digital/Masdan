import { boolean, pgTable, smallint, text } from "drizzle-orm/pg-core";

// Seeded by a post-migration script: a migrate-only database can't create a
// household.
export const currency = pgTable("currency", {
  code: text("code").primaryKey(),
  /** Hides a currency from pickers without orphaning rows that reference it. */
  enabled: boolean("enabled").default(true).notNull(),
  minorUnits: smallint("minor_units").notNull(),
  name: text("name").notNull(),
  /** Disambiguated for an English reader: CAD is `CA$`, not `$`. */
  symbol: text("symbol").notNull(),
  /** What the currency's own locale prints: CAD is `$`. */
  symbolNative: text("symbol_native").notNull(),
});
