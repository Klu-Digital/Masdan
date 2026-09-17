# Post-migration scripts

For schema changes that can't be expressed as DDL alone — a calculated column that needs every existing row backfilled, data that needs reshaping after a migration adds a table. A drizzle migration changes structure; a post-migration script changes data, in TypeScript, with access to the app's schema.

## Quick start

```bash
pnpm db:post-migrate:new "backfill user slug"
# → packages/db/src/post-migration-scripts/20260902141530_backfill_user_slug.ts
```

Fill in `up`:

```ts
import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { user } from "../schema";

export default definePostMigration({
  description: "Backfill user.slug from name",
  async up({ db, log }) {
    const rows = await db.select({ id: user.id, name: user.name }).from(user);
    log.info("backfilling users", { count: rows.length });
    for (const row of rows) {
      await db
        .update(user)
        .set({ slug: slugify(row.name) })
        .where(eq(user.id, row.id));
    }
  },
});
```

Try it without touching data:

```bash
pnpm db:post-migrate --dry-run
```

Then for real:

```bash
pnpm db:post-migrate
```

Check what's run:

```bash
pnpm db:post-migrate:status
```

## What `up` gets

- **`db`** — bound to this run. By default it's a live transaction: every write in `up` commits together, or none of them do.
- **`sql`** — re-exported from `drizzle-orm`, for raw statements.
- **`log`** — pre-tagged with the script's own name.
- **`dryRun`** — true under `--dry-run`. With the default transactional mode you can usually ignore this; the runner rolls the transaction back for you after `up` returns. A script that opts out of transactions (below) must check it itself.

## Options

```ts
export default definePostMigration({
  description: "...",
  async up(ctx) {
    /* ... */
  },
  transaction: true, // default. false for CREATE INDEX CONCURRENTLY, or self-batched work.
  timeoutMs: 300_000, // statement_timeout for the run. default 5 minutes.
});
```

## Batching a large backfill

A backfill over a table too large for one transaction should commit in chunks rather than hold one transaction (and one lock footprint) open for the whole run. Set `transaction: false` and manage your own commits with keyset pagination:

```ts
export default definePostMigration({
  description: "Backfill order.total for all rows",
  transaction: false,
  async up({ db, log, dryRun }) {
    let cursor: string | null = null;
    let count = 0;
    for (;;) {
      const batch = await db
        .select({ id: order.id, ... })
        .from(order)
        .where(cursor ? gt(order.id, cursor) : undefined)
        .orderBy(order.id)
        .limit(1000);
      if (batch.length === 0) break;

      if (!dryRun) {
        await db.transaction(async (tx) => {
          for (const row of batch) {
            await tx.update(order).set({ total: computeTotal(row) }).where(eq(order.id, row.id));
          }
        });
      }

      cursor = batch.at(-1)!.id;
      count += batch.length;
      log.info("progress", { count });
    }
  },
});
```

With `transaction: false` there is no automatic rollback for `--dry-run` — that's what the `if (!dryRun)` above is doing. The runner's own guarantee is narrower here: a dry run never writes a tracking row, so re-running for real afterward isn't blocked by a phantom "already applied" record.

## How runs are tracked

Every attempt is recorded in the `post_migration` table, one row per script name. Only `status = 'success'` counts as applied — `pnpm db:post-migrate` only runs scripts that don't have a successful row yet, in filename order. A `failed` or `running` row is overwritten by the next attempt of that same script, not appended to; it's the debugging trail for whatever went wrong.

Editing a script after it has succeeded is checked for: the file's hash is compared against what ran, and a mismatch aborts the whole run naming the script. This is almost always a sign you meant to write a new script instead of editing history. If you're certain the edit is safe (a typo in a comment, say), `--allow-modified` proceeds without re-running it.

## CLI reference

```
pnpm db:post-migrate [run]     # run all pending scripts, in order
pnpm db:post-migrate status    # table of every script's current state
pnpm db:post-migrate:new "<description>"
```

Flags on `run`:

| flag | effect |
| --- | --- |
| `--dry-run` | execute, then discard — nothing written, nothing recorded |
| `--only <name>` | run a single script by its full filename (no `.ts`) |
| `--force` | re-run a script that already succeeded — requires `--only` |
| `--allow-modified` | proceed past a checksum mismatch instead of aborting |
| `--lock-timeout <ms>` | how long to wait for the run lock (default 30000) |

Two invocations never run concurrently — the runner holds a Postgres advisory lock for the duration of the run.

## Rollback

There isn't one. Data migrations rarely invert cleanly — if a script did the wrong thing, write a new script that fixes it forward rather than trying to undo the old one.
