import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { seedInterestCatalog } from "../reference/seed-interest-catalog";

export default definePostMigration({
  description:
    "Add Maya Time Deposit Plus at 5.5% without changing legacy rates",
  async up({ db, log }) {
    log.info("interest catalog seeded", await seedInterestCatalog(db));
  },
});
