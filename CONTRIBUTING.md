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

`pnpm db:deploy` is the composite one — drizzle migrations, then pg-boss's own schema, then any pending post-migration scripts. Running only `pnpm db:migrate` leaves the queue schema absent, and the server will log `queue.start_failed` and serve reads with enqueueing broken. It also leaves the `currency` table empty, so signing up fails on `organization.default_currency`.

`pnpm db:seed` fills a fresh database with a demo household: sign in as `K1@gmail.com` (password `K1@gmail.com`) for a year of transactions, budgets, cards and a goal. [`packages/db/src/dev-scripts/seed/README.md`](packages/db/src/dev-scripts/seed/README.md) has the rest.

`pnpm dev` brings up the infrastructure containers and then opens [mprocs](https://github.com/pvolok/mprocs), a small terminal UI that gives each process its own pane and its own scrollback rather than interleaving everything into one stream. `web`, `server` and `workers` start automatically; `infra` (container logs) is listed but idle. Select it and press `s` to start it.

| Key |  |
| --- | --- |
| `j` / `k` | move between processes |
| `C-a` | toggle between the process list and the focused pane's terminal, which is what lets you type into a process |
| `s` / `x` / `r` | start / stop / restart the selected process |
| `q` | quit everything |

The panes are configured in [`mprocs.yaml`](mprocs.yaml). The web app is at [http://localhost:2600](http://localhost:2600) and the API at [http://localhost:1900](http://localhost:1900).

Ports are deliberately not all upstream defaults:

| Service          | Default | Override with                             |
| ---------------- | ------- | ----------------------------------------- |
| server           | `1900`  | `PORT` (env var or `apps/server/.env`)    |
| web              | `2600`  | `WEB_PORT` (env var; `PORT` also honored) |
| workers (health) | `1901`  | `WORKERS_PORT`                            |
| postgres         | `4400`  | `POSTGRES_PORT`                           |
| redis            | `6666`  | `REDIS_PORT` (not Redis's default `6379`) |
| minio (S3 API)   | `5300`  | `MINIO_PORT`                              |
| minio (console)  | `5301`  | `MINIO_CONSOLE_PORT`                      |

## Working on it

```bash
pnpm dev            # everything
pnpm dev:server     # or one at a time
pnpm check          # lint + format, what the pre-commit hook runs
pnpm check-types    # tsc across the workspace; not part of `check`
pnpm test           # all three test projects
```

Lefthook installs a pre-commit hook that runs oxlint and oxfmt over staged files and restages what it fixes. It does not run tests or typecheck — do that yourself before pushing.

## Layout

```
masdan/
├── apps/
│   ├── web/           # React SPA (TanStack Router), served by nginx
│   ├── server/        # Hono HTTP server: auth, oRPC, metrics; queue producer only
│   ├── workers/       # pg-boss consumer: jobs, cron, queue maintenance
│   └── www/           # The marketing site (Astro)
├── packages/
│   ├── api/           # oRPC procedures, routers, and the business logic
│   ├── auth/          # better-auth config and RBAC roles
│   ├── card-catalog/  # Real credit-card looks as data, per country
│   ├── db/            # Drizzle schema, migrations, post-migration scripts
│   ├── env/           # Validated env schemas and the feature-flag registry
│   ├── observability/ # evlog logging + PostHog drain
│   ├── queue/         # Typed pg-boss job registry
│   ├── redis/         # Client, cache, and rate-limit primitives
│   ├── storage/       # S3-compatible presigned uploads
│   ├── testing/       # Test harness: db, redis, queue, auth helpers
│   └── ui/            # Shared coss ui components and styles
├── docs/              # Self-hosting guide, ADRs, screenshots
└── CONTEXT.md         # Glossary of the product's terms
```

The reasoning behind each area lives in a README beside the code: [web](apps/web/README.md), [server](apps/server/README.md), [auth and RBAC](packages/auth/README.md), [Redis](packages/redis/README.md), [storage](packages/storage/README.md), [feature flags](packages/api/src/feature-flags/README.md), [chat entry](packages/api/src/chat/README.md), [the queue](packages/queue/README.md), and one per feature under `packages/api/src/`.

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

Reach for a `.db.test.ts` when the thing under test is the SQL, the transaction boundary, or a better-auth hook. Everything else is cheaper and faster as a unit test — see `apps/server/src/metrics.test.ts` for the module-mocking pattern that gets around `@masdan/env/server` freezing its config at import.

## Database changes

```bash
pnpm db:generate --name add_goal_notes    # migration from a schema edit, named for what it does
pnpm db:deploy
pnpm db:post-migrate:new "backfill slugs"  # only if data needs moving too
```

`pnpm db:push` exists for local iteration only. Anything committed gets a migration, so that every environment applies the same statements in the same order. Always pass `--name` with a short snake_case description of the change; without it drizzle-kit picks a random name (`normal_ben_parker`) that tells the next reader nothing.

Post-migration scripts are for data, because a migration holds schema changes only — a backfill for a column the migration just added, or reference rows like `currency`. They live beside the migrations and run in order, once each; [`packages/db/src/dev-scripts/post-migrate/README.md`](packages/db/src/dev-scripts/post-migrate/README.md) is the authoring guide.

## Conventions

**Comments explain why, not what.** The existing ones are long where the reasoning is non-obvious — read a few before writing your own. Anything that took an afternoon to work out belongs in a comment or in the "things that bite" list of the README beside the code, because the next person will otherwise spend the same afternoon.

**Add an API procedure at the right rung of the ladder** in `packages/api/src/procedures.ts`: `publicProcedure` → `protectedProcedure` → `orgProcedure`, and the `mutationProcedure` variants when it writes. A mutation that invalidates a cache must do it through `context.afterCommit(...)`, never inline — the handler runs inside an open transaction.

**Fail open on optional infrastructure.** Redis, object storage and the queue are all optional, and every caller degrades rather than erroring. Keep it that way: a caching layer that can take the site down is worse than no caching layer.

**Never edit generated files.** `apps/web/src/routeTree.gen.ts` and `packages/db/src/migrations/*/snapshot.json` are outputs.

**Adding credit cards, banks or countries** is data-only work with its own guide and agent prompt: [packages/card-catalog/CONTRIBUTING.md](packages/card-catalog/CONTRIBUTING.md).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Infrastructure containers, then web, server and workers in an mprocs pane each |
| `pnpm dev:web` / `dev:server` / `dev:workers` | One process on its own |
| `pnpm build` | Build every app |
| `pnpm check` | Vite+ format and lint checks |
| `pnpm check-types` | TypeScript across the workspace |
| `pnpm lint` / `pnpm format` / `pnpm staged` | Lint, format, or check staged files only |
| `pnpm db:push` | Push schema changes to a local database. Use migrations for anything committed |
| `pnpm db:generate --name <snake_case>` | New migration from a schema edit, named for what it does |
| `pnpm db:migrate` | Drizzle migrations only |
| `pnpm db:deploy` | Migrations, pg-boss's schema, then pending post-migration scripts |
| `pnpm queue:migrate` | pg-boss's schema only (included in `db:deploy`) |
| `pnpm db:post-migrate` / `:status` / `:new "<description>"` | Run, list or scaffold post-migration scripts |
| `pnpm db:seed` | Fill a fresh database with demo data |
| `pnpm db:purge -- --yes` | **Destructive.** Drop every table and row ([guide](packages/db/src/dev-scripts/purge/README.md)) |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm admin:grant <email>` | Make an existing account platform admin |
| `pnpm admin:reset-password <email>` | Set a new password and revoke the account's sessions |
| `pnpm redis:start` / `redis:watch` / `redis:stop` / `redis:down` | Manage the local Redis container |
| `pnpm docker:build` / `docker:up` / `docker:logs` / `docker:down` | Manage the Docker Compose stack |
| `pnpm secrets:setup` | Local `.env` files and safe local secrets; `--environment staging\|production` runs the deployment wizard |
| `pnpm secrets:check` | Report local configuration, or verify a deployment against GitHub and Dokploy |
| `pnpm telegram:webhook set <https-origin>` / `info` | Register or inspect the Telegram webhook |

## Pull requests

Keep the branch focused, make sure `pnpm check`, `pnpm check-types` and `pnpm test` all pass, and say in the description what you verified by hand — particularly for anything touching auth, migrations, or the Docker setup, where the tests cannot see the whole picture.
