# Demo

`apps/web`, built with no server: no database, API, auth, storage, Redis or AI. The whole household lives in memory in the browser, seeded fresh on every load, so the build is a folder of static files that one Cloudflare Worker (or Pages project) serves.

```bash
pnpm --filter demo dev      # http://localhost:2700
pnpm --filter demo build    # → apps/demo/dist
pnpm --filter demo deploy   # build, then `wrangler deploy` (static assets only)
```

Pages works too: `pnpm dlx wrangler@4 pages deploy apps/demo/dist`. With no `404.html`, Pages already falls back to `index.html`; `_headers` carries the CSP and security headers on both.

## How it works

There is no copy of the web app. `vite.config.ts` builds `apps/web/src` and swaps a handful of its modules, by resolved path, for stand-ins:

- `src/utils/client.ts` → `src/backend/client.ts`: oRPC's real `createORPCClient` over a link that calls in-memory handlers instead of `/rpc`. Every screen, query key and `invalidate()` works unchanged.
- `src/lib/auth-client.ts` → `src/overrides/auth-client.ts`: one demo user who owns one household and is never a platform admin, so `/admin` redirects. Only "signed in" survives a reload (sessionStorage); signing out rebuilds the household.
- The sign-in form (account filled in and locked), the sign-up form, the shell banner, and the server-only sections (imports, attachments, chat apps, exports, calendar feeds) have stand-ins in `src/overrides/`.

A stand-in may import the module it replaces, which is how `app-shell.tsx` wraps the real shell.

## The fake backend

`src/backend/` mirrors `packages/api`: `seed.ts` ports the dev seeder with a fixed PRNG and dates relative to today, `ledger.ts` and `flows.ts` re-derive balances, cash flow and category totals with the same formulas as the SQL, and each `handlers/*.ts` answers one router. Pure modules (`rules/engine`, `bills/bill-rules`, `recurring/recurrence`, `reports/periods`, the quick-entry parser) are imported from `@masdan/api`, not rewritten.

Handlers are typed against `AppRouterClient`, so `pnpm --filter demo check-types` fails when a procedure's input or output changes shape. A procedure with no handler rejects with a defined `PRECONDITION_FAILED` ("off in the demo"), which the app's error toast shows. When a web screen starts calling a new procedure, add its handler here. `client.test.ts` exercises the ledger paths.

Feature flags all report their defaults (off), so AI features stay hidden. Everything is in one currency, so consolidated net worth is the identity.
