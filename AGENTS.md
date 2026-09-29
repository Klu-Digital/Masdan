# AGENTS.md

Masdan is a self-hosted household finance tracker: accounts, an income/expense ledger, budgets, bills, credit-card statements and reports, shared by the members of a household. It sends no email. Stack: React/TanStack Router web, Hono + oRPC API, background workers, Postgres/Drizzle, better-auth. pnpm workspace, `@masdan/*` package scope.

Vocabulary is in [CONTEXT.md](CONTEXT.md): a **household** is better-auth's `organization`, and the **ledger** is transactions and transfers, from which balances are derived. Use those words in code and comments. The reasoning behind the decisions that surprise people is in [docs/adr/](docs/adr/).

## Layout

```
apps/web       React SPA (TanStack Router, Tailwind, coss ui via packages/ui)
apps/server    Hono HTTP server — mounts auth, oRPC, metrics. Queue PRODUCER only
apps/workers   pg-boss consumer — runs jobs, cron, queue maintenance
packages/api   oRPC procedure ladder, middleware, routers. The business logic
packages/card-catalog  Real credit-card looks as data, one folder per country. Adding cards: its CONTRIBUTING.md
packages/auth  better-auth config, RBAC role definitions
packages/db    Drizzle schema, migrations, post-migration scripts, dev scripts
packages/env   Validated env schemas (server/web/workers) + the feature-flag registry
packages/queue Typed pg-boss job registry
packages/redis Client, cache, rate-limit primitives — all optional
packages/storage        S3-compatible presigned uploads
packages/observability  evlog logging + PostHog drain
packages/testing        Test harness: db, redis, queue, auth helpers
packages/ui    Shared coss ui primitives (Base UI + Tailwind). Primitives only
```

## Commands

```bash
pnpm dev                # everything; also dev:web / dev:server / dev:workers
pnpm check              # ultracite check — oxlint + oxfmt with the Ultracite preset
pnpm fix                # ultracite fix — autofix lint + format (pre-commit runs this on staged files)
pnpm check-types        # tsc across the workspace — NOT part of `check`, run it separately
pnpm db:deploy          # migrations + pg-boss schema + post-migration scripts
pnpm db:generate        # new migration from a schema edit
pnpm db:purge -- --yes  # DESTRUCTIVE local reset
```

`pnpm db:migrate` alone leaves the pg-boss schema absent — the server boots but logs `queue.start_failed` and every enqueue is broken. Use `db:deploy`.

Ports are deliberately not upstream defaults: server 1900, web 2600, workers 1901, **postgres 4400**, **redis 6666**, minio 5300/5301.

## Tests

The filename routes the test. Three vitest projects:

- `*.db.test.ts` → **db** project: real Postgres via testcontainers, real Redis. Each worker gets its own Redis logical database, flushed between tests.
- `apps/web/**/*.test.{ts,tsx}` → **web** project: jsdom.
- everything else `*.test.ts` → **unit** project: node, no I/O.

Run one file: `pnpm exec vitest run --project unit path/to/file.test.ts`.

`@masdan/env/server` freezes its config at import, so `vi.stubEnv` does not work on it. Mock the module instead — `apps/server/src/metrics.test.ts` is the pattern.

Reference tables are held back from the per-test `TRUNCATE` — `REFERENCE_TABLES` in `packages/testing/src/db.ts`. `currency` is seeded by a post-migration script, which the test template runs after `drizzle-kit migrate`; truncating it would break `organization.default_currency` for every test that signs a user up. A test that mutates a reference row has to put it back.

## Invariants worth knowing before editing

These are the ones that cost real time to rediscover. The README carries the fuller writeups under each feature's "things that bite".

**Cache invalidation inside a mutation must go through `context.afterCommit()`.** `mutationProcedure` wraps handlers in `db.transaction(...)`, so a `cache.del()` called inline purges a key the transaction may still roll back. The `.use(afterCommit).use(transaction)` order in `packages/api/src/procedures.ts` is load-bearing — reversing it silently reintroduces the bug.

**Sessions live in Postgres, not Redis.** Setting better-auth's `secondaryStorage` stops it writing the `session` row, which breaks the `activeOrganizationId` repair in `packages/auth/src/index.ts` and 403s every new user. `rateLimit.customStorage` is a different door and is the one we use. `packages/auth/src/personal-organization.db.test.ts` guards this.

**Optional infrastructure degrades, but security and cost limits never vanish.** Redis, storage and the queue all degrade rather than erroring — with `REDIS_URL` unset the server boots normally and the cache becomes a pass-through. Rate limits are the exception to failing open: count through `countHit` from `@masdan/redis`, which falls back to an in-process window (per process, so looser across replicas) rather than letting everything through. Preserve both when adding callers.

**Every AI call is capped and charged.** `completeJson` in `packages/api/src/ai/gateway.ts` sends a per-feature `max_tokens` (defaults in `ai/features.ts`, overridden at `/admin/ai` and cached per process for 30s like flags) and takes a `household` whose daily token spend, in Postgres (`ai_usage`), is checked against `AI_DAILY_TOKEN_BUDGET` before the call and charged after it. Pass the request's `db`, never a transaction handle: a rollback would refund the tokens.

**apps/server enqueues, apps/workers runs.** Cron and queue maintenance belong to workers so nothing competes with the request path. `queue.start()` is fatal in workers and deliberately non-fatal in the server.

**Feature flags are declared in code and valued in the database.** `packages/env/src/flags.ts` is the registry — adding a flag is still a deploy, which is what keeps `FeatureFlagName` a typed union — but its on/off value lives in `feature_flag` and is toggled at `/admin/flags`. Reads go through `getFeatureFlags(db)` / `isFeatureEnabled(db, name)` in `packages/api/src/feature-flags/feature-flags.cache.ts`, cached per process for 30s. Two things follow: the admin `set`/`reset` handlers must invalidate via `context.afterCommit()` and must never read flags inside their own transaction, and hiding UI with `useFeatureFlag` is cosmetic — use `requireFlag()` on the procedure to make something actually unreachable (it answers `NOT_FOUND`, not `FORBIDDEN`).

**Reset links never go through `log`.** Structured logs drain to PostHog, so a logged reset URL is an account takeover handed to a third party. Masdan sends no email: reset links go out through `deliver()` (raw stdout) or back to the admin who asked for one, and point straight at the web page rather than better-auth's `/api/auth/reset-password/<token>` redirect, whose path the request logger records. Invitations are bearer links: never match one by email. See [Accounts, recovery and invitations](README.md#accounts-recovery-and-invitations).

**Two role columns.** `member.role` is per-organization and is what `requirePermission` reads; `user.role` is global, from better-auth's `admin()` plugin, for back-office powers. Product permissions belong on the first.

**The SPA and the API share one origin.** `VITE_SERVER_URL` defaults to `/`, and nginx in the web image proxies `/api/auth`, `/rpc` and `/feeds/` (calendar subscriptions) to `SERVER_UPSTREAM` — separate prefixes, not one, because the server mounts them as siblings at its root. A new public route needs its own nginx `location` and Vite proxy entry. That is what keeps the web image environment-agnostic (one build promotes staging → production). Three things follow: the API needs no public hostname, `TRUST_PROXY_HEADERS` must be on wherever a proxy sits in front or rate limiting keys every caller to the proxy's IP, and the nginx upstream goes through a `resolver` with a variable because a literal hostname in `proxy_pass` is resolved once at startup and cached for the life of the process.

**A route's `head()` title is its breadcrumb.** `AppBreadcrumbs` builds the trail from the matched routes' `head()` meta titles, so naming a screen for the tab names it in the breadcrumb too, and there is no second table of paths to keep in sync. A route with no title contributes no crumb; the root's title is the product name and is skipped. For a dynamic segment, `head({ loaderData })` reads the record — which means the route needs a `loader`, and **`loader` must be written above `head`** or TypeScript infers `loaderData` as `never`. That ordering is why `users.$userId.tsx` and `organizations.$organizationId.tsx` carry an `oxlint-disable sort-keys`.

**The runtime images carry production dependencies only.** The server and workers images are `pnpm deploy --prod` output plus the bundle, so there is no tsx, drizzle-kit or workspace source in them. Migrations and post-migration scripts run from the server Dockerfile's `migrate` target; the admin CLIs are bundled into `apps/server/dist/admin/` for the same reason. A new operational command that needs a dev dependency belongs in the migrate image, not the runtime one.

**Presigned uploads bypass the server's CORS config.** The browser PUTs straight to the bucket, so the _bucket_ must allow the web origin, and the SPA's CSP `connect-src` must include the storage endpoint (`CSP_CONNECT_SRC` in `apps/web/nginx.conf.template`). `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` are not the same thing.

## Writing code here

**Procedures.** Add at the right rung of the ladder in `packages/api/src/procedures.ts`: `publicProcedure` → `protectedProcedure` → `orgProcedure` → `adminProcedure`, each with a `mutation` variant that adds the transaction and `afterCommit`. `requirePermission` is the declarative check for route-level authorization; `assertPermission` is the same check as an expression when authorization depends on the row rather than the route. Feature-scoped files live beside their feature (`packages/api/src/files/files.router.ts`), and `*.platform.ts` is the platform-admin surface, which deliberately ignores `organizationId` — say so in a comment, since every other query in this codebase filters on it.

**Routers are transport.** A `*.router.ts` holds input schemas, the procedure rung, permissions and a call into the feature's `*.queries.ts` (reads) or `*.commands.ts` (writes) — plain `(db, organizationId, …)` functions that workers and Telegram can import too. Only `routers/index.ts` and `routers/admin.ts` may import a router (tests excepted); oxlint's `no-restricted-imports` enforces it, because router-to-router imports are where cycles started. Cross-feature helpers live in `packages/api/src/shared/`: `money.ts` (amount schemas and BigInt scaling, also used by the web forms), `dates.ts` (`isoDate`), `errors.ts` (`notFound(entity)`, and `domainErrors`: the codes whose messages are written for people, declared on the base builder so they reach the web as defined errors — throw INTERNAL_SERVER_ERROR for anything whose message is not), `ownership.ts` (`findOwned`/`lockOwned` for "this household's row or NOT_FOUND"), `household.ts` (`householdSettings`, `householdDate`) and `chunks.ts`. Reach for these before writing another copy.

**Web data goes through oRPC query utils.** Tenant reads use `householdOrpc(activeOrganizationId).<router>.<proc>.queryOptions()`, whose keys start with the household so a switch never serves the previous one's cache; `orpc` is for household-free data (admin, currencies, invites). A screen's reads are built once in its module's `queries.ts` (`overviewQueries`, `ledgerQueries`), which the components use and the route `loader` hands to `prefetch()` from `apps/web/src/utils/prefetch.ts`, so they start alongside the household gate's instead of after it. Writes use `.mutationOptions()` and, on success, `invalidate(queryClient, activeOrganizationId, write)` from `apps/web/src/utils/invalidate.ts`, the one map of which routers a write makes stale — add to it rather than hand-picking keys. Failures toast once from the `QueryClient` caches through `errorMessage`, which shows only defined errors' messages; a screen that shows the failure inline sets `meta: { suppressErrorToast: true }`. Forms await `mutateAsync(...).catch(() => null)`. Component tests mock `@/utils/client` with `mockClient` from `src/test/client.ts`.

**Logging.** Reach for `log` from `@masdan/observability`, never `console`. Every call carries an `action` — a dotted, snake_cased event name that is the thing you will later grep and alert on (`redis.error`, `queue.start_failed`, `featureflags.read.failed`). Spread `parseError(error)` into the payload rather than stringifying the error yourself.

**Styling.** The `shadcn/*` oxlint rules are errors in app code: no raw colors, no inline styles, no arbitrary values, no unknown classes, and class names must be static strings (no `` `text-${tone}-500` ``). Colors come from the theme in `packages/ui/src/styles/globals.css`. `layout` is the one allowed arbitrary-value escape. Two exemptions are configured deliberately in `oxlint.config.ts`: `packages/ui/src/**` may style itself because it _is_ the design system, and so may `apps/web/src/components/finance/**`, the money, privacy-mode and card-art rendering that is domain code rather than a primitive (`packages/ui` holds none). Import primitives as `@masdan/ui/components/button`; add more with `npx shadcn@latest add @coss/<name> -c packages/ui`.

**Lint deltas from the Ultracite preset.** `no-await-in-loop` is off — plenty of loops here are deliberately sequential (ordered migrations, retry backoff, cursor walks) and the rule's suggested fix is a bug. `react/no-unstable-nested-components` allows render props. Everything else is the preset, and `pnpm fix` autofixes most of it.

**Comments.** One line, naming the bug the line prevents. [TERSE.md](TERSE.md) has the budget, what earns more than a line, and the directive and template-literal gotchas.

**Columns.** Instants, amounts and rates come from `packages/db/src/schema/columns.ts`: `timestamptz()` (never bare `timestamp()`), `timestamps()` for the usual `createdAt`/`updatedAt` pair, `money()` and `rate()`. Timestamp columns are `timestamptz`, so turn one into a household-local day with `(col at time zone ${timezone})::date`. Don't add an `at time zone 'UTC'` first, because that shifts the value by the household's offset.

**Household references.** A table holding household data carries `organization_id`, join tables included, and points at another household-owned row through a composite foreign key on `(organization_id, <parent>_id)` against the parent's `UNIQUE (organization_id, id)` ([ADR 0002](docs/adr/0002-tenant-integrity-in-the-database.md)). That makes a cross-household reference a database error rather than something each procedure must remember to prevent. References to accounts, categories, tags and schedules are `ON DELETE RESTRICT`, because those rows are archived rather than deleted; `packages/api/src/shared/household-integrity.db.test.ts` has one case per table.

**Migrations and backfills.** `pnpm db:push` is for local iteration only; anything committed gets a migration. Generate it with `pnpm db:generate --name <snake_case_description>` (`add_budget_month_index`, not drizzle's random `normal_ben_parker`), so the folder name says what the migration does. Start from what `drizzle-kit generate` wrote; hand-edit the SQL only when it cannot express the change safely, e.g. composite foreign keys added `NOT VALID` and then `VALIDATE`d ([ADR 0002](docs/adr/0002-tenant-integrity-in-the-database.md)), or a `USING` cast on a column type. Validate a hand-edited migration on a scratch database, since `db:deploy` fails on the push-built local one. Drizzle's snapshot can name a constraint differently from the database, which truncates names at 63 characters, so check a `DROP CONSTRAINT` against the real name. **Backfills never go in a migration**: no `UPDATE`, `INSERT` or `DELETE` of rows in migration SQL, without exception. Migrations change structure only; data backfills and reference rows (like `currency`) go in `packages/db/src/post-migration-scripts/`, so a database that has only been migrated cannot create a household until they run: use `db:deploy`, never `db:migrate` alone. Before writing a backfill at all, ask whether any database holding the data exists; Masdan is not yet deployed, so a new `NOT NULL` column needs none.

**Generated files stay untouched:** `apps/web/src/routeTree.gen.ts` and migration `snapshot.json`.

**Env vars.** Adding a server env var means adding it to the matching `.env.example` too — `packages/env/src/env-example.test.ts` fails otherwise. Everything the server reads is validated at startup by `packages/env/src/server.ts`, so a missing variable is a boot error naming it, not a mystery at the first request.

## Ultracite code standards

This project uses **Ultracite**, a zero-config preset over Oxlint + Oxfmt. Most issues are automatically fixable — run `pnpm fix` before committing, and `pnpm check` to see what is outstanding. (`pnpm exec ultracite doctor` diagnoses the setup itself.) The repo's deltas from the preset are in [Writing code here](#writing-code-here); everything below is the preset's baseline.

Write code that is **accessible, performant, type-safe, and maintainable**. Favor clarity and explicit intent over brevity.

### Type safety and explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Lean on TypeScript's type narrowing instead of type assertions
- Extract magic numbers into constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async and promises

- Always `await` promises in async functions — use the return value
- Use `async/await` syntax instead of promise chains for readability
- Handle errors in async code with try-catch blocks
- Keep async functions out of Promise executors

### React and JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Define components at module scope, not inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

**React 19+:** use ref as a prop instead of `React.forwardRef`.

### Error handling and debugging

- Keep `console.log`, `debugger` and `alert` out of committed code — reach for the logger instead, as [Writing code here](#writing-code-here) describes
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully — catching only to rethrow adds nothing
- Prefer early returns over nested conditionals for error cases

### Code organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Reach for `dangerouslySetInnerHTML` only when there is genuinely no alternative
- Keep `eval()` and direct `document.cookie` assignment out of the codebase
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)

### Testing

- Write assertions inside `it()` or `test()` blocks
- Use async/await in async tests rather than done callbacks
- Keep `.only` and `.skip` out of committed code
- Keep test suites reasonably flat — avoid excessive `describe` nesting

### What the linter cannot check

Oxlint catches most of the above automatically. Spend your own attention on:

1. **Business logic correctness** — the linter cannot validate an algorithm
2. **Meaningful naming** — for functions, variables, and types
3. **Architecture decisions** — component structure, data flow, API design
4. **Edge cases** — boundary conditions and error states
5. **User experience** — accessibility, performance, usability
6. **Documentation** — comments for subtle logic, per [TERSE.md](TERSE.md)

## Fuller writeups

Each of these has a README section carrying the reasoning the summary above compresses:

- [Accounts, recovery and invitations](README.md#accounts-recovery-and-invitations), [Feature flags](README.md#feature-flags), [Authorization (RBAC)](README.md#authorization-rbac)
- [Redis](README.md#redis) and [Cache](README.md#cache), [Object storage](README.md#object-storage)
- [Security headers](README.md#security-headers), [The web image is environment-agnostic](README.md#the-web-image-is-environment-agnostic)
- [Page titles and breadcrumbs](README.md#page-titles-and-breadcrumbs), [UI Customization](README.md#ui-customization)
- [Post-migration scripts](README.md#post-migration-scripts) and its [authoring guide](packages/db/src/dev-scripts/post-migrate/README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md) — first-run setup, env files, the services to bring up
