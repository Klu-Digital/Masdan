#!/usr/bin/env node
// Must run before the imports below: `@masdan/db` reads env at module scope.
import { loadEnv, runLifecycle } from "../bootstrap";

const USAGE = `Usage:
  pnpm admin:grant <email>

Sets user.role = "admin" for the given email — the *global* back-office role
@masdan/api's adminProcedure gates on, not a per-organization member.role. Not a
migration and not a post-migration script: this is one-off operator tooling
for turning an existing account into the first platform admin.

The local seeder (packages/db/src/dev-scripts/seed/seeders/users.ts) already
creates an admin account, so a freshly seeded database needs no run of this.

Inside the server image, the same command runs the bundled copy.
`;

const main = async (): Promise<void> => {
  loadEnv();

  const argv = process.argv.slice(2);
  // Both `pnpm run` and `vp run` forward the "--" literally.
  while (argv[0] === "--") {
    argv.shift();
  }

  const [email] = argv;
  if (!email) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const { createDb, createPool } = await import("../../index");
  const { user } = await import("../../schema/auth");
  const { eq } = await import("drizzle-orm");
  const pool = createPool();

  await runLifecycle(
    async () => {
      const db = createDb(pool);

      // better-auth lowercases email on sign-up, so a case-sensitive match here
      // would miss the account.
      const [updated] = await db
        .update(user)
        .set({ role: "admin" })
        .where(eq(user.email, email.toLowerCase()))
        .returning({ email: user.email, id: user.id });

      if (!updated) {
        console.error(`No user found with email "${email}".`);
        return 1;
      }

      console.log(
        `Granted platform admin to ${updated.email} (${updated.id}).`
      );
      return 0;
    },
    () => pool.end()
  );
};

main();
