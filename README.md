# Masdan

A self-hosted household finance tracker. Members of a household share accounts, record income, expenses and transfers in one ledger, plan with budgets and savings goals, keep on top of bills and credit-card statements, and read reports, all on infrastructure they run themselves. Masdan sends no email: recovery is admin-driven (see [Accounts, recovery and invitations](#accounts-recovery-and-invitations)).

## Features

- **Accounts** - Assets and liabilities across currencies, credit cards with real card looks and statements, balance history and a net-worth balance sheet
- **Ledger** - Income, expenses, transfers, splits, tags, attachments, recurring schedules, CSV import and export
- **Planning** - Category budgets, savings goals, a bill calendar with a subscribable due-date feed, credit-card reminders
- **Reports** - Cash flow, category spending, savings-rate trends and budget performance
- **Assistance** - Quick entry from free text, receipt photos and chat (Telegram), AI categorization suggestions and Ask Masdan, all optional and capped per household
- **Households** - Roles and permissions, link-based invitations, an admin console and feature flags
- **Web** - React with TanStack Router, on a Hono + oRPC API
- **Postgres and Drizzle** - The system of record, including sessions and the job queue; Redis and S3-compatible storage are optional

See [CONTEXT.md](CONTEXT.md) for what the product's terms mean (household, ledger, posting, statement) and [docs/adr/](docs/adr/) for why the non-obvious decisions were made.

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

Set up local configuration with the idempotent bootstrap command:

```bash
pnpm secrets:setup
pnpm secrets:check
```

It creates the app `.env` files, generates only locally safe secrets, and keeps external provider credentials out of local development — no PostHog, Tailscale, Dokploy or cloud account is needed to run `pnpm dev`.

Deployment is the same command with an environment:

```bash
pnpm secrets:setup --environment staging
pnpm secrets:check --environment staging
```

The wizard asks provider by provider, decides for itself which values are GitHub Secrets, GitHub Variables or Dokploy runtime variables, shows you the destinations before it writes anything, then applies and verifies. Deployment secrets are held in memory and written straight to GitHub and Dokploy — never to a local file. Rerunning it resumes: names that already exist remotely are skipped, never rotated. Runtime validation still lives in `packages/env`, and `pnpm secrets:check` reports what is set and what is missing.

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply migrations, the queue schema and post-migration scripts to your database:

```bash
pnpm run db:deploy
```

Then, run the development server:

```bash
pnpm run dev
```

`pnpm run dev` brings up the infrastructure containers and then opens [mprocs](https://github.com/pvolok/mprocs), a small terminal UI that gives each process its own pane and its own scrollback rather than interleaving everything into one stream. `web`, `server` and `workers` start automatically; `infra` (container logs) is listed but idle — select it and press `s` to start it.

| Key |  |
| --- | --- |
| `j` / `k` | move between processes |
| `C-a` | toggle between the process list and the focused pane's terminal |
| `s` / `x` / `r` | start / stop / restart the selected process |
| `q` | quit everything |

The panes are configured in [`mprocs.yaml`](mprocs.yaml). `C-a` is what lets you type into a process.

Open [http://localhost:2600](http://localhost:2600) in your browser to see the web application. The API is running at [http://localhost:1900](http://localhost:1900).

### Ports

| Service          | Default | Override with                             |
| ---------------- | ------- | ----------------------------------------- |
| server           | `1900`  | `PORT` (env var or `apps/server/.env`)    |
| web              | `2600`  | `WEB_PORT` (env var; `PORT` also honored) |
| workers (health) | `1901`  | `WORKERS_PORT`                            |
| postgres         | `4400`  | `POSTGRES_PORT`                           |
| redis            | `6666`  | `REDIS_PORT` (not Redis's default `6379`) |
| minio (S3 API)   | `5300`  | `MINIO_PORT`                              |
| minio (console)  | `5301`  | `MINIO_CONSOLE_PORT`                      |

For Docker Compose, set `SERVER_PORT` / `WEB_PORT` (e.g. in a root `.env` file) to remap both the published ports and the wiring between services.

### Post-migration scripts

Some schema changes need data backfilled, not just structure changed — a calculated column added by a migration, say, that every existing row needs a value for. Those live as TypeScript scripts in `packages/db/src/post-migration-scripts/`, alongside the drizzle migrations they follow:

```bash
pnpm db:post-migrate:new "backfill user slug"   # scaffold a new script
pnpm db:post-migrate                            # run everything pending
pnpm db:post-migrate:status                     # see what's run and what hasn't
```

See [`packages/db/src/dev-scripts/post-migrate/README.md`](packages/db/src/dev-scripts/post-migrate/README.md) for the full authoring guide.

## UI Customization

React web apps in this stack share [coss ui](https://coss.com/ui) primitives through `packages/ui`. coss ui is a Base UI + Tailwind component set distributed through the shadcn CLI, so the registry is wired up in `components.json` as `@coss` and the files are vendored, not installed.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust aliases, registries or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add @coss/accordion @coss/dialog @coss/popover -c packages/ui

# or re-sync the whole set
npx shadcn@latest add @coss/ui --overwrite -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@masdan/ui/components/button";
```

### Page titles and breadcrumbs

A screen names itself once. `head()` on the route is the single source for both the document title and the breadcrumb trail — `AppBreadcrumbs` (`apps/web/src/components/app-breadcrumbs.tsx`) walks the matched routes and takes whichever `meta` entry carries a `title`.

```tsx
export const Route = createFileRoute("/_auth/admin/users")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Users" }] }),
});
```

That is the whole contract for a static screen. Nesting is implicit: `/admin` contributes "Admin", `/admin/users` contributes "Users", and the trail follows the route tree rather than a hand-maintained table of paths. A route that sets no title contributes no crumb, which is how pathless layouts like `_auth` stay out of the trail.

A dynamic segment names itself from its data. `head()` runs after the loader and receives `loaderData`, so the crumb can say the record's name instead of the word "User":

```tsx
export const Route = createFileRoute("/_auth/admin/users/$userId")({
  component: RouteComponent,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.admin.users.detail.queryOptions({ input: { userId: params.userId } })
    ),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.user?.name ?? "User" }],
  }),
});
```

Things that bite:

- **`loader` has to be written above `head`.** TypeScript resolves the route options object in source order, and with `head` first it has not yet inferred what the loader returns, so `loaderData` widens to `never` and every property access on it fails to compile. This is the one place in the codebase where route options are deliberately not key-sorted — both dynamic routes carry an `/* oxlint-disable sort-keys */` for it.
- **Always give the fallback a sensible label.** An id that resolves to nothing still renders a crumb; `loaderData?.user?.name ?? "User"` is the difference between a generic trail and one reading "undefined".
- **The loader is what makes the crumb possible, not an extra request.** `ensureQueryData` seeds the same cache entry the component's `useQuery` reads, so the page costs one fetch. The real trade is timing: navigation now waits for the record before it paints rather than flashing a skeleton, which is deliberate — a breadcrumb that arrives a beat after the page is a layout shift in the header.
- **The root route's title is the product name, not a crumb.** `__root.tsx` sets `title: "masdan"` as the fallback tab title; `AppBreadcrumbs` skips the root match so it never appears in the trail. Every child title overrides it in the tab.
- **`staticData.crumb` is gone.** It could not express a dynamic crumb, and keeping both would mean two places to name a screen.

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: pnpm run docker:build
- Start: pnpm run docker:up
- Logs: pnpm run docker:logs
- Stop: pnpm run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

The stack mirrors production: only the web container publishes a port (`WEB_PORT`, container port 8080, because the unprivileged nginx image cannot bind 80), and the API is reached through its proxy. All three images run as non-root users and declare their own `HEALTHCHECK`.

The server and workers images hold only production dependencies and the bundle. Migrations and post-migration scripts need drizzle-kit and tsx, so `deploy.yml` runs them from the server Dockerfile's `migrate` target, which `release.yml` builds and pushes as a fourth image.

The web image serves the SPA through nginx using `apps/web/nginx.conf.template`, which is rendered at container start so the CSP can name this deployment's storage origin — see [Security headers](#security-headers).

### The web image is environment-agnostic

`VITE_SERVER_URL` defaults to `/`, meaning "the origin that served this page". nginx forwards the prefixes the API mounts — `/api/auth`, `/rpc` and `/feeds/` — to `SERVER_UPSTREAM`, so the browser only ever talks to one origin. Nothing environment-specific is inlined at build time, which is what lets a single built image be promoted from staging to production rather than rebuilt per environment. `apps/web/vite.config.ts` proxies the same prefixes so `pnpm dev` runs the same topology.

Three consequences worth knowing:

- **The API needs no public hostname.** It is reachable only through the web origin. `/api-reference` and the Prometheus metrics path are deliberately _not_ proxied, so they stay private. `/api-reference` is not mounted at all when `NODE_ENV=production`.
- **Set `TRUST_PROXY_HEADERS=true` wherever a proxy sits in front.** `packages/api/src/client-ip.ts` reads the first hop of `x-forwarded-for` for rate limiting; without the flag every caller is identified by the proxy's address instead. nginx appends to the chain rather than replacing it, so an upstream proxy's value survives.
- **`SERVER_UPSTREAM` goes through a resolver on purpose.** A hostname written literally into `proxy_pass` is resolved once at nginx startup and cached for the process's life, so recreating the API container would leave nginx posting at an address nothing answers on. The variable-plus-`resolver` form re-resolves per request.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Security headers

Both tiers set their own, because they serve different things and a header that suits one is wrong for the other.

**The API** (`apps/server/src/security-headers.ts`) runs Hono's `secureHeaders()` with two content security policies, chosen per request. Every JSON route gets `default-src 'none'` — a browser never renders those responses, so the policy can be the strictest CSP can express. `/api-reference` gets a looser one, because the Scalar docs UI is real HTML that pulls a bundle from jsDelivr and runs an inline config script.

Two departures from Hono's defaults are worth knowing:

- **`Cross-Origin-Resource-Policy` is `cross-origin`, not the default `same-origin`.** This server exists to be read from another origin — the web app on `CORS_ORIGIN`. Leaving the default would be a same-origin restriction sitting directly behind a CORS config that exists to allow the opposite.
- **`X-Frame-Options` is `DENY` rather than `SAMEORIGIN`.** Nothing here is ever meant to be framed, including by itself.

`Strict-Transport-Security` keeps Hono's default. Browsers ignore it entirely over plain HTTP, so it costs local development nothing and needs no `NODE_ENV` branch.

**The web app** is served by nginx from `apps/web/nginx.conf.template`, rendered at container start by the nginx image's own envsubst step. It is a template for one reason: the SPA's `connect-src` has to name the origins it talks to, and those are deployment-specific. `CSP_CONNECT_SRC` carries them.

Two things that bite:

- **`connect-src` needs the object storage endpoint.** The API is same-origin — `'self'` covers it — but uploads go straight from the browser to a presigned URL, so omitting the bucket breaks uploads and nothing else, a confusing way to find out. `docker-compose.yml` sets it for the local stack.
- **Unsetting `CSP_CONNECT_SRC` is not the same as setting it empty.** envsubst only substitutes variables that exist in the environment, so an unset one stays literal, and nginx then reads `$CSP_CONNECT_SRC` as one of its own variables and refuses to start: `unknown "csp_connect_src" variable`. The Dockerfile's `ENV CSP_CONNECT_SRC=""` is what keeps that from happening. Failing loudly at boot beats shipping a policy with a hole in it.

nginx sends the same `Strict-Transport-Security` value as the API (`max-age=15552000; includeSubDomains`), so the origin has one policy whether a response came from nginx or was proxied. Mind `includeSubDomains` before serving Masdan on an apex domain whose subdomains are not all on HTTPS: it is slow and painful to undo.

### Session cookie attributes

`defaultCookieAttributes` in `packages/auth/src/index.ts` answers two independent questions, and keeping them independent is the point.

`Secure` follows **deployment**: on in `production` and `staging`, off everywhere else. `SameSite` follows **topology**: it compares the sites of `BETTER_AUTH_URL` and `CORS_ORIGIN` and answers `Lax` when they match, `None` only when they genuinely differ and the environment is deployed. Under the default same-origin setup that means `SameSite=Lax; Secure` in production — the tighter pair, with CSRF protection the cross-site version gives up. Split the API back onto its own host and it returns `None` on its own, no code change.

Deriving both from one flag, as this did before, is the trap: the day the topology becomes same-site in production is the day the cookie also stops being `Secure`. `None` without `Secure` is illegal anyway, so the two must move separately.

Sending `None; Secure` everywhere appears to work locally because Chrome and Firefox special-case `http://localhost` and accept `Secure` cookies over it. Safari does not, and neither extends that exception to a dev server reached over a LAN IP — the usual way to open the web app on a real phone. The failure is silent: the cookie is dropped and every request looks signed out. Note that a port is not part of a _site_, so `localhost:2600` and `localhost:1900` are same-site regardless.

## Object storage

Uploads go straight from the client to the bucket. `storage.createUpload` reserves a `file` row and returns a presigned `PUT`; the client uploads the bytes itself; `storage.confirmUpload` then verifies the object landed and records the real size and checksum. Bytes never pass through the API server, so large files cost it nothing.

Any S3-compatible backend works — MinIO locally, AWS S3 / Cloudflare R2 / Tigris in production — by changing env vars only:

| Variable | Notes |
| --- | --- |
| `S3_BUCKET` | Uploads are disabled unless this and both credentials are set |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |  |
| `S3_REGION` | Defaults to `auto` (right for R2; use a real region on AWS) |
| `S3_ENDPOINT` | Server → bucket. Omit on real AWS S3 |
| `S3_PUBLIC_ENDPOINT` | Host baked into presigned URLs. Defaults to `S3_ENDPOINT` |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO, `false` for R2, irrelevant on AWS |
| `STORAGE_MAX_UPLOAD_BYTES` | Defaults to 25 MiB |

Start the local bucket with:

```sh
docker compose up -d minio minio-init
```

The MinIO console is at [http://localhost:5301](http://localhost:5301) (`minioadmin` / `minioadmin` by default).

Two things that bite:

- **`S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` are not the same thing.** A presigned URL bakes in the host it was signed against. Inside Compose the server reaches MinIO at `http://minio:9000`, but a URL with that host is useless to a browser — hence the separate public endpoint. Running the server outside Compose, both are `localhost`.
- **Bucket CORS is separate from the server's CORS config.** The presigned `PUT` goes to the bucket, so the _bucket_ is what must allow it. Locally that is MinIO's `MINIO_API_CORS_ALLOW_ORIGIN` (already set in `docker-compose.yml`); on S3 or R2 it is a one-time bucket CORS rule allowing `PUT` from your web origin and exposing `ETag`.

## Redis

Redis backs three things: better-auth's own rate limiter, an oRPC `rateLimit()` middleware for our own procedures (plus chat entry's per-sender and link-code limits), and a `createCache()` primitive used at call sites throughout the API. It is **optional** — with `REDIS_URL` unset the server boots exactly as before: every rate limit counts in process memory instead, and the cache becomes a pass-through. Sessions are deliberately **not** in Redis; see the second item under "Five things that bite" below.

| Variable | Notes |
| --- | --- |
| `REDIS_URL` | Everything in this section is disabled unless this is set |
| `REDIS_KEY_PREFIX` | Prefixes every key. Set it when several environments share one instance |
| `AUTH_RATE_LIMIT_ENABLED` | better-auth's own default is production-only; this opts in or out explicitly |
| `AUTH_RATE_LIMIT_WINDOW` | Seconds. Defaults to `10` |
| `AUTH_RATE_LIMIT_MAX` | Defaults to `100` |
| `TRUST_PROXY_HEADERS` | Whether `x-forwarded-for` (and friends) is trusted for the rate-limit client IP. Only enable behind a proxy you control |

Start the local container with:

```bash
pnpm run redis:start
```

The host port is **6666**, not Redis's default 6379 — the container-internal port is still 6379, which is why the compose-network `REDIS_URL` on the `server` service reads `redis://redis:6379`. Poke around a running instance with:

```bash
docker exec -it masdan-redis redis-cli
```

### Cache

`createCache(namespace)` from `@masdan/redis` returns `get` / `set` / `del` / `remember`, all namespaced under `${namespace}:`:

```ts
const orgCache = createCache("org");
const org = await orgCache.remember(orgId, 60, () => loadOrg(orgId));
```

Every method swallows Redis failures by design — a down or unreachable Redis degrades `get` to a miss, `set`/`del` to no-ops, and `remember` to calling `fn` directly. There is no stampede protection: concurrent callers that miss the same key all call `fn` and all write the result. Caching is an optimization here, not a dependency.

Five things that bite:

- **better-auth's rate limiter is global unless a proxy sets `x-forwarded-for`.** It resolves the caller from headers only — it is handed a `Request`, so it can never see the socket — and when it finds no usable header it buckets _every_ caller under one shared `no-trusted-ip` key. Verified locally: a direct request produces the key `auth-rl:no-trusted-ip|/sign-in/email`. So on a directly-exposed deployment `AUTH_RATE_LIMIT_MAX` is a limit on your whole userbase at once, not per caller. Behind a proxy that sets `x-forwarded-for` it does the right thing; configure better-auth's `advanced.ipAddress.trustedProxies` with your proxy's CIDRs for a multi-hop chain. Note this is better-auth's own setting and is **separate from `TRUST_PROXY_HEADERS`**, which only governs the oRPC `rateLimit()` middleware via `packages/api/src/client-ip.ts`.
- **Rate limiting falls back to process memory; only the cache fails open.** Every limiter here guards security (sign-in, link codes) or AI spend, so none may vanish with Redis. `countHit` counts in Redis when it answers and in an in-process fixed window when it is unset or a command fails, logging `ratelimit.fallback`. Nothing is rejected because Redis is down, so a Redis outage is not an auth outage. The cost: the fallback is per process, so N replicas allow N times the limit, and a restart resets it. Alert on `redis.error` and `ratelimit.fallback`.
- **Sessions are deliberately not in Redis.** better-auth's `secondaryStorage` is a _different_ option from `rateLimit.customStorage`, and turning it on stops better-auth from writing the Postgres `session` row at all — which breaks the `activeOrganizationId` repair in `packages/auth/src/index.ts`'s `user.create.after` hook and 403s every newly signed-up user out of `requireOrganization`. If you want to cut the per-request session query in `packages/api/src/context.ts`, evaluate better-auth's `session.cookieCache`, not `secondaryStorage`. `packages/auth/src/personal-organization.db.test.ts` is the regression test that catches this if it regresses.
- **Cache invalidation inside a mutation runs inside an open transaction.** `mutationProcedure` wraps handlers in `db.transaction(...)`, so a `cache.del()` called directly from a handler purges a key the transaction may still roll back. Use `context.afterCommit(...)` instead (see its docblock in `packages/api/src/procedures.ts`):

  ```ts
  createUpload: mutationProcedure.handler(async ({ context, input }) => {
    const row = await context.db.insert(file).values(/* ... */).returning();
    context.afterCommit(() => cache.del(`org:${context.organizationId}:files`));
    return row;
  }),
  ```

- **`REDIS_KEY_PREFIX` is not test isolation.** Test workers each get their own numbered Redis logical database (`redis://…/N`, derived from `VITEST_POOL_ID`) and a `FLUSHDB` between tests. Never point the suite at a Redis you care about.

## Feature flags

Flags are _declared_ in code and _valued_ in the database, so turning one on is a click at `/admin/flags` rather than a deploy. Declare one in `packages/env/src/flags.ts`:

```ts
export const featureFlagRegistry = {
  FF__NEW_THING: {
    defaultEnabled: false,
    description: "What turning it on does, shown in the admin UI.",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
```

That is the whole setup — no migration, no seed, no env var. A flag with no row in `feature_flag` resolves to its `defaultEnabled`, and a row appears the first time an admin toggles it.

In an authenticated web route:

```tsx
const showNewThing = useFeatureFlag("FF__NEW_THING");
```

On the server, read through the resolver in `@masdan/api/feature-flags` — it needs a `db` because the value lives in a table, and it is cached per process so this is a map lookup on all but one call in thirty:

```ts
import { isFeatureEnabled } from "@masdan/api/feature-flags";

if (await isFeatureEnabled(context.db, "FF__NEW_THING")) {
  /* ... */
}
```

`getFeatureFlags(db)` returns all of them at once, for a loop or a payload.

To make a procedure unreachable rather than merely invisible:

```ts
newThing: protectedProcedure
  .use(requireFlag("FF__NEW_THING"))
  .handler(async ({ context }) => { /* ... */ }),
```

`requireFlag` needs only `db` from the context, which every rung has, so it composes onto any procedure — public, protected, or org-scoped. A flagged-off procedure answers `NOT_FOUND` rather than `FORBIDDEN`, since `FORBIDDEN` would confirm the endpoint exists.

Names are typed against the registry: a typo is a compile error at a call site and a `BAD_REQUEST` at the API, not a silent `false`.

Things to know:

- **A toggle takes up to 30 seconds to reach every server.** Each process caches the table read for `FEATURE_FLAG_TTL_MS`; the instance that handled the toggle invalidates its own cache once the transaction commits, the rest catch up within the TTL. The web client mirrors the same window, so an open tab picks a change up without a reload.
- **Reading is for anyone signed in; writing is platform-admin only.** `featureFlags.all` is a `protectedProcedure` — the web app needs it to decide what to render — while `admin.featureFlags.set` / `.reset` sit behind `adminMutationProcedure` on the global `user.role`.
- **Adding a flag is still a deploy.** Only its value moved to the database. Declaring a flag is a code change on purpose: it is what keeps `FeatureFlagName` a typed union and `rg FF__NEW_THING` a complete answer.
- **Flags are global.** No per-user targeting and no percentage rollouts. If you need either, replace this with a real flag platform rather than extending it.
- **`useFeatureFlag` only works signed in.** `featureFlags.all` is a `protectedProcedure`, so calling the hook outside `src/routes/_auth/*` fails with `UNAUTHORIZED` and toasts at the user.
- **Only declared flags are returned.** Reads walk the registry rather than returning whatever rows the table holds, so deleting a flag from code leaves an orphan row that nothing resurrects.
- **Hiding UI is not gating.** `useFeatureFlag` only decides what renders; the procedure behind it stays callable by anyone who knows its name. Reach for `requireFlag` whenever the flag is protecting unreleased work rather than just tidying the UI.
- **Auth is checked before the flag.** On `protectedProcedure.use(requireFlag(...))` a signed-out caller gets `UNAUTHORIZED`, never `NOT_FOUND`, so an anonymous probe cannot tell a flagged-off procedure from a flagged-on one.
- **A flag read fails open to the last known values.** If the query fails, the resolver serves its cached values (or the declared defaults on a cold cache) and logs `featureflags.read.failed` rather than turning a degraded database into a 500 on every gated route.

## Authorization (RBAC)

Roles are defined once in `packages/auth/src/permissions.ts` and enforced as a rung on the oRPC procedure ladder:

```ts
listInvoices: orgProcedure
  .use(requirePermission({ invoice: ["read"] }))
  .handler(async ({ context }) => { /* ... */ }),
```

This is better-auth's `access` module rather than a hand-rolled permissions schema, so there are **no role tables and no migration** — `member.role` already exists, and roles are typed data that the web client imports unchanged.

Things to know:

- **Two role columns, two meanings.** `member.role` is per-organization and is what `requirePermission` reads; `user.role` (from the `admin()` plugin) is global and is for your own back-office powers. Product permissions belong on the first.
- **Checks are ANDed and fail closed.** `requirePermission({})` denies everyone, owners included.
- **Role changes take effect immediately.** The caller's role is read per request in `requireOrganization`, not baked into the session.
- **Everyone is `owner` of their personal organization**, so the default single-user experience is unchanged by any of this.

Full guide, including the ownership (`:any`) convention and how to add a resource: [`packages/auth/README.md`](packages/auth/README.md).

## Accounts, recovery and invitations

Masdan is self-hosted and **sends no email**. Recovery is admin-driven, with shell access to the server as the root of trust.

- **Sign-up is closed by default.** The first account on an empty database bootstraps the instance and becomes platform admin (`user.role = "admin"`). After that, only someone holding a household invite link can create an account. Set `ALLOW_SIGNUP=true` to open it.
- **Invitations are links.** An invitation's email is only a label. The inviter copies the link from household settings and sends it themselves, and whoever holds it can join with the invited role until it expires or is cancelled. Accepting goes through `invitations.accept`; better-auth's email-matched invitation endpoints are blocked.
- **A platform admin resets passwords** from `/admin/users/<id>` → Password. That creates a one-time link, valid for 24 hours, which the admin hands over out of band. Completing it signs the user out everywhere.
- **A locked-out lone admin uses the CLI:** `pnpm admin:reset-password <email>` prompts for a new password (empty generates one) and revokes the account's sessions. The same command works inside the server container (Dokploy's terminal or `docker exec`), where it runs a bundled copy. `pnpm admin:grant <email>` makes an existing account platform admin the same way, locally or in the container.
- **Forgot password** still works as a fallback for whoever runs the server: the reset link is written to the server's raw stdout (`docker logs`), never to the structured logger.

Things that bite:

- **A reset link must never reach `log`.** Structured logs drain to PostHog when `POSTHOG_PROJECT_API_KEY` is set, so a logged link is an account takeover handed to a third party. Delivery goes through `deliver()` in `packages/auth/src/deliver.ts`, the one place optional SMTP would slot in. Links point straight at the web page, because better-auth's own `/api/auth/reset-password/<token>` redirect puts the token in a path the request logger records.
- **The sign-up gate only guards HTTP.** Server-side `auth.api.signUpEmail` calls (the seeder, `signUpTestUser`) carry no request and bypass it, and so never mint a bootstrap admin.

## Data export

Households can download their records as CSV from **Settings → Household → Export data**: transactions, splits, transaction tags, transfers, accounts, balance history, credit-card statements, categories and tags. Each file comes from its own `exports.*` procedure, is generated synchronously from Postgres, and covers only the active household.

Things to know:

- **Archived rows are exported, not dropped.** They carry `archived_at`.
- **Amounts are exact numeric text** (`-1234.500000`). Free-text cells that start with `= + - @` get a leading `'` to block spreadsheet formula injection. Amount columns are never prefixed.
- **Every join repeats the `organization_id` filter.** Keep it that way when adding columns.

Column reference, ordering and format rules: [`packages/api/src/exports/README.md`](packages/api/src/exports/README.md).

## Chat entry

A linked user can add a transaction by messaging Masdan from a chat app, e.g. `dinner at jollibee 400 metrobank mc`. Telegram is the first channel. Chat entry does no parsing of its own: it runs the same quick-entry pipeline as the web (`parseQuickEntryText`) and creates through `createTransaction`, so validation, entity resolution and household scoping are shared.

```text
chat app -> public ingress (/chat/<channel>/webhook only)
         -> apps/server: adapter verifies + reads -> receiveChatMessage: rate-limit, record, enqueue
         -> apps/workers: processChatMessage (link | parse + create) -> adapter.send(reply)
```

Telegram also accepts receipt photos and JPEG/PNG/WebP image documents. Set a vision-capable `RECEIPT_AI_MODEL` and configure storage on the workers; the optional caption supplies the payment account (e.g. `metrobank mc`). PDFs are not supported. Nothing is created or stored unless the receipt resolves completely and unambiguously.

Everything in `packages/api/src/chat/` is channel-neutral: commands, link codes, replies, the receive half, the processor and the settings router. A channel is an adapter (`chat.channel.ts`) that owns only what differs: verifying its webhook, reading its payload into an `InboundChatMessage`, answering in its format, and sending a reply.

Setup:

1. Configure a channel. For Telegram, create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` in both `apps/server/.env` and `apps/workers/.env`. Set `TELEGRAM_WEBHOOK_SECRET` in the server's (`pnpm secrets:setup` generates it). Set `CHAT_APP_URL` in the workers'. The workers also need the AI gateway variables.
2. Expose **only** `/chat/<channel>/webhook` publicly, through a reverse proxy scoped to that path: a Cloudflare Tunnel ingress rule with `path: ^/chat/[a-z]+/webhook$` and a catch-all `http_status:404`, a Tailscale Funnel on that path, or a dedicated nginx `server` block. Everything else stays on the tailnet.
3. Register the webhook with the channel. For Telegram, `pnpm telegram:webhook set https://<public-origin>` sets it with its secret token and `allowed_updates: ["message"]`, and `pnpm telegram:webhook info` shows its state.
4. Turn on `FF__CHAT_ENTRY` at `/admin/flags`. Users link from **Settings → Household → Chat apps**. One single-use code, valid for 10 minutes, works on whichever configured channel it is sent from as `/link <code>`.

Adding a channel (WhatsApp, Discord, …):

1. Add its name to `chatChannels` in `packages/db/src/schema/chat.ts`. The columns are plain text, so no migration is needed.
2. Write `packages/api/src/chat/channels/<name>.ts` implementing `ChatChannelAdapter`, and register it in `chat.channels.ts`. The registry's mapped type makes a missing adapter a compile error.
3. Add its credentials to `packages/env/src/integrations.ts`, both `.env.example` files and the secrets manifest. `isConfigured()` reads them. Until they are set, the channel answers 404 and is not offered in settings.

Things that bite:

- **Adapters get the raw `Request`**, not parsed JSON. WhatsApp verifies with a GET handshake and an HMAC over the exact body, and Discord with an Ed25519 signature over it. The route accepts every method for the same reason.
- **Answer success for anything that isn't a rejection.** Channels redeliver on other statuses, Telegram indefinitely. Flag-off and ignored messages still get 200.
- **Link codes are 40 bits, so the limits on `/link` are what stop guessing.** Per 10-minute code lifetime: 5 attempts per chat account, 3 per code across all senders, and 60 overall. The overall ceiling is what stops many accounts guessing at once, at the cost of a crowd briefly blocking linking for everyone. They are checked in `receiveChatMessage` before anything is enqueued.
- **Replies that need no worker come back as a `reply` receipt**: help, rate limits, "try again". Telegram returns them in the webhook response body. A channel without that facility must send them itself.
- **A link binds one chat account to one user in one household**, whichever household was active when the code was made, per channel. Membership and `transaction:create` are re-checked on every message, so a removed or demoted member stops posting at once.
- **External ids are text.** Discord snowflakes overflow a JS number.
- **Chat entry only creates when the AI parse succeeded and the result is complete.** Anything missing or ambiguous, or any AI failure, gets the issues back plus a `/transactions?quickEntry=…` link. That link reruns quick entry and always opens the prefilled form, so following a link never creates.
- **`chat_inbound_message` makes delivery idempotent twice over.** Its `(channel, message_id)` key drops a channel's retries. `processed_at`, claimed in the same transaction as the write, makes a retried job a no-op. That is also why the reply is best-effort: a failed send is logged (`chat.reply.failed`), not retried.
- Message text is never logged. It is stored only in the queued job's payload.

## Project Structure

```
masdan/
├── apps/
│   ├── web/         # React SPA (TanStack Router)
│   ├── server/      # Hono HTTP server: auth, oRPC, metrics; queue producer only
│   └── workers/     # pg-boss consumer: jobs, cron, queue maintenance
├── packages/
│   ├── api/         # oRPC procedures, routers, and the business logic
│   ├── auth/        # better-auth config and RBAC roles
│   ├── card-catalog/ # Real credit-card looks as data, per country
│   ├── db/          # Drizzle schema, migrations, post-migration scripts
│   ├── env/         # Validated env schemas and the feature-flag registry
│   ├── observability/ # evlog logging + PostHog drain
│   ├── queue/       # Typed pg-boss job registry
│   ├── redis/       # Client, cache, and rate-limit primitives
│   ├── storage/     # S3-compatible presigned uploads
│   ├── testing/     # Test harness: db, redis, queue, auth helpers
│   └── ui/          # Shared coss ui components and styles
├── docs/adr/        # Architecture decision records
└── CONTEXT.md       # Glossary of the product's terms
```

## Available Scripts

- `pnpm run dev`: Start the infrastructure containers, then the web application, the server and the workers in an mprocs pane each. The container logs are available as a pane but do not start on their own
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run dev:workers`: Start only the background job workers
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database (local iteration; use migrations for anything committed)
- `pnpm run db:generate --name <snake_case_description>`: Generate a new migration from schema changes; always name it for what it does
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:deploy`: Run migrations, install the pg-boss schema, then any pending post-migration scripts
- `pnpm run queue:migrate`: Apply pg-boss's own schema migrations (included in `db:deploy`)
- `pnpm run db:post-migrate`: Run pending post-migration scripts (see [Post-migration scripts](#post-migration-scripts))
- `pnpm run db:post-migrate:status`: Show which post-migration scripts have run
- `pnpm run db:post-migrate:new "<description>"`: Scaffold a new post-migration script
- `pnpm run db:purge -- --yes`: **Destructive.** Drop every table and row for a clean local reset (see [`packages/db/src/dev-scripts/purge/README.md`](packages/db/src/dev-scripts/purge/README.md))
- `pnpm run db:studio`: Open database studio UI
- `pnpm run admin:grant <email>`: Make an existing account platform admin
- `pnpm run admin:reset-password <email>`: Set a new password and revoke the account's sessions (see [Accounts, recovery and invitations](#accounts-recovery-and-invitations))
- `pnpm run redis:start`: Start the local Redis container in the background
- `pnpm run redis:watch`: Start the local Redis container attached, streaming logs
- `pnpm run redis:stop`: Stop the local Redis container
- `pnpm run redis:down`: Stop and remove the local Redis container
- `pnpm run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `pnpm run lint`: Run Vite+ lint checks
- `pnpm run format`: Run Vite+ formatting
- `pnpm run staged`: Run Vite+ checks against staged files
- `pnpm run docker:build`: Build the Docker Compose images
- `pnpm run docker:up`: Build and start the Docker Compose stack
- `pnpm run docker:logs`: Tail logs from the Docker Compose stack
- `pnpm run docker:down`: Stop the Docker Compose stack
- `pnpm run secrets:setup`: Create local env files and generate safe local secrets; `--environment staging|production` runs the deployment wizard
- `pnpm run telegram:webhook set <https-origin>`: Register the Telegram webhook for chat entry (see [Chat entry](#chat-entry)); `info` shows its current state
- `pnpm run secrets:check`: Report local configuration, or verify a deployment environment against GitHub and Dokploy

## Contributing

Setup, the test layout, and the conventions worth following are in [CONTRIBUTING.md](CONTRIBUTING.md). [AGENTS.md](AGENTS.md) is the condensed version, aimed at coding agents.

## License

MIT — see [LICENSE](LICENSE).
