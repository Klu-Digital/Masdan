import { definePostMigration } from "../dev-scripts/post-migrate/define";
// import { user } from "../schema";

export default definePostMigration({
  description: "init",
  async up({ log }) {
    // Write the backfill here. For a table too large for one transaction, see
    // ../dev-scripts/post-migrate/README.md and set `transaction: false`.
    log.info("starting");
  },
  // transaction: false,
  // timeoutMs: 300_000,
});
