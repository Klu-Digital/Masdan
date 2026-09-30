import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { seedInterestCatalog } from "../reference/seed-interest-catalog";

// A rate refresh is a new script calling the same seed: this file's checksum
// is recorded, so editing the presets alone never re-runs it.
export default definePostMigration({
  description:
    "Seed the interest catalog from src/reference/interest-presets.ts",
  async up({ db, log }) {
    log.info("interest catalog seeded", await seedInterestCatalog(db));
  },
});
