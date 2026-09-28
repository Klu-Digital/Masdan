import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { currencies } from "../reference/currencies";
import { currency } from "../schema";

export default definePostMigration({
  description: "Seed the currency table from src/reference/currencies.ts",
  async up({ db, log, sql }) {
    // `enabled` is deliberately not in the update: it is an operator's choice
    // about what the pickers offer, not reference data to overwrite.
    await db
      .insert(currency)
      .values([...currencies])
      .onConflictDoUpdate({
        set: {
          minorUnits: sql`excluded.minor_units`,
          name: sql`excluded.name`,
          symbol: sql`excluded.symbol`,
          symbolNative: sql`excluded.symbol_native`,
        },
        target: currency.code,
      });

    log.info("currency reference seeded", { count: currencies.length });
  },
});
