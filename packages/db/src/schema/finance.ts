import { boolean, pgTable, smallint, text } from "drizzle-orm/pg-core";

/**
 * ISO 4217 reference data, not tenant data: no `organizationId`, no id column —
 * the code is the key, and `organization.default_currency` points at it.
 *
 * The table exists for what it carries, not to police a three-letter string.
 * `minorUnits` is the one every ledger path needs (JPY 0, PHP 2, KWD 3) and is
 * wrong often enough in hand-copied currency lists to be worth storing once.
 *
 * Seeded by the migration that creates it, so a migrate-only environment (the
 * test template) is complete; `packages/db/src/reference/currencies.ts` is the
 * maintained source and a post-migration script reconciles the table with it.
 */
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
