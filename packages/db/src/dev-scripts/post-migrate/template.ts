/** The body written into every freshly scaffolded post-migration script. */
export const renderPostMigrationTemplate = (description: string): string =>
  `import { definePostMigration } from "../dev-scripts/post-migrate/define";
// import { user } from "../schema";

export default definePostMigration({
  description: ${JSON.stringify(description)},
  async up({ log }) {
    // Write the backfill here — pull \`db\` off the ctx once you do. Runs in a
    // transaction by default; for CREATE INDEX CONCURRENTLY or a table too large
    // for one, see the batched-backfill recipe in
    // ../dev-scripts/post-migrate/README.md and set \`transaction: false\` below.
    log.info("starting");
  },
  // transaction: false,
  // timeoutMs: 300_000,
});
`;
