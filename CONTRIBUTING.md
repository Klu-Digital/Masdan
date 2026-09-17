# Contributing

## Setup

Requires Node 24+, pnpm 10+, and Docker.

```bash
pnpm install
pnpm secrets:setup
pnpm secrets:check
```

Then bring up the backing services and the schema:

```bash
docker compose up -d postgres redis minio minio-init
pnpm db:deploy
pnpm dev
```

`pnpm db:deploy` is the composite one — drizzle migrations, then pg-boss's own schema, then any pending post-migration scripts. Running only `pnpm db:migrate` leaves the queue schema absent, and the server will log `queue.start_failed` and serve reads with enqueueing broken.

Ports are deliberately not all upstream defaults; see the table in the README.

## Working on it

```bash
pnpm dev            # everything
pnpm dev:server     # or one at a time
pnpm check          # lint + format, what the pre-commit hook runs
pnpm check-types    # tsc across the workspace; not part of `check`
pnpm test           # all three test projects
```

Lefthook installs a pre-commit hook that runs oxlint and oxfmt over staged files and restages what it fixes. It does not run tests or typecheck — do that yourself before pushing.

## Tests

Three vitest projects, split by what they need rather than by what they cover. The file name is what routes a test, so the suffix is not cosmetic:

| Project | Files | Environment |
| --- | --- | --- |
| `unit` | `*.test.ts` outside apps/web | node, no I/O |
| `db` | `*.db.test.ts` | node, real Postgres + Redis in Docker |
| `web` | `apps/web/**/*.test.{ts,tsx}` | jsdom |

```bash
pnpm test:unit
pnpm test:db      # first run pulls images; allow a couple of minutes
pnpm test:web
pnpm test:watch
```

`db` tests get a real Postgres via testcontainers, migrated once per run, and each worker gets its own numbered Redis logical database that is flushed between tests. Point the suite at a Redis you care about and it will erase it.

Reach for a `.db.test.ts` when the thing under test is the SQL, the transaction boundary, or a better-auth hook. Everything else is cheaper and faster as a unit test — see `apps/server/src/metrics.test.ts` for the module-mocking pattern that gets around `@k22i/env/server` freezing its config at import.

## Database changes

```bash
pnpm db:generate                          # migration from a schema edit
pnpm db:migrate
pnpm db:post-migrate:new "backfill slugs"  # only if data needs moving too
```

`pnpm db:push` exists for local iteration only. Anything committed gets a migration, so that every environment applies the same statements in the same order.

Post-migration scripts are for data that a migration cannot express — a backfill for a column the migration just added. They live beside the migrations and run in order, once each; [`packages/db/src/dev-scripts/post-migrate/README.md`](packages/db/src/dev-scripts/post-migrate/README.md) is the authoring guide.

## Conventions

**Comments explain why, not what.** The existing ones are long where the reasoning is non-obvious — read a few before writing your own. Anything that took an afternoon to work out belongs in a comment or in the README's "things that bite" lists, because the next person will otherwise spend the same afternoon.

**Add an API procedure at the right rung of the ladder** in `packages/api/src/procedures.ts`: `publicProcedure` → `protectedProcedure` → `orgProcedure`, and the `mutationProcedure` variants when it writes. A mutation that invalidates a cache must do it through `context.afterCommit(...)`, never inline — the handler runs inside an open transaction.

**Fail open on optional infrastructure.** Redis, object storage and the queue are all optional, and every caller degrades rather than erroring. Keep it that way: a caching layer that can take the site down is worse than no caching layer.

**Never edit generated files.** `apps/web/src/routeTree.gen.ts` and `packages/db/src/migrations/*/snapshot.json` are outputs.

## Pull requests

Keep the branch focused, make sure `pnpm check`, `pnpm check-types` and `pnpm test` all pass, and say in the description what you verified by hand — particularly for anything touching auth, migrations, or the Docker setup, where the tests cannot see the whole picture.
