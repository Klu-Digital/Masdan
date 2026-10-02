# server

The Hono HTTP server: better-auth, the oRPC API, the iCal feeds, chat webhooks and metrics. It only produces jobs; `apps/workers` consumes them.

## Boot and migrations

The server image migrates its own database. Its entry, `dist/start.mjs` (`src/start.ts`), applies the drizzle migrations and pg-boss's schema, starts the server, then runs pending post-migration scripts in the background. CI never connects to the database, which in production sits on a private network CI cannot reach.

- **A failed migration exits the container** before it serves traffic.
- **A failed post-migration script is logged** and retried on the next boot.
- **The compose stack skips all of this.** It overrides the entry to `dist/index.mjs`, since the local database is push-built.

## Client IP and `TRUSTED_PROXY_HOPS`

The API is reached only through the web image's nginx (see [`apps/web/README.md`](../web/README.md#nginx-and-the-environment-agnostic-image)), so the socket address is always a proxy. Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the server: `1` for the web image's nginx alone, `2` when another proxy (Traefik, a load balancer) sits in front of nginx.

Each proxy appends the address it saw to `x-forwarded-for`, so `packages/auth/src/client-ip.ts` counts that many entries back from the right; anything further left is whatever the caller sent and is never trusted. Too low and every caller is identified by a proxy's address; too high and callers can pick their own.

The server resolves the address once per request and hands it to both the oRPC `rateLimit()` middleware and better-auth. better-auth never parses `x-forwarded-for` itself: it is handed a `Request`, so it can never see the socket, and its own parsing disagrees with ours. It rejects any chain longer than one entry and then buckets _every_ caller under one shared `no-trusted-ip` key. So the server stamps the resolved address on the request as `x-masdan-client-ip`, overwriting any copy the caller sent, and `advanced.ipAddress.ipAddressHeaders` points better-auth at that header alone. Calling `auth.handler` without `withClientIp` from `@masdan/auth/client-ip` brings the shared bucket back.

## Security headers

Both tiers set their own, because they serve different things and a header that suits one is wrong for the other. The web tier's are in [`apps/web/README.md`](../web/README.md#security-headers).

`src/security-headers.ts` runs Hono's `secureHeaders()` with two content security policies, chosen per request. Every JSON route gets `default-src 'none'`. A browser never renders those responses, so the policy can be the strictest CSP can express. `/api-reference` gets a looser one, because the Scalar docs UI is real HTML that pulls a bundle from jsDelivr and runs an inline config script.

Two departures from Hono's defaults:

- **`Cross-Origin-Resource-Policy` is `cross-origin`, not the default `same-origin`.** This server exists to be read from another origin, the web app on `CORS_ORIGIN`. Leaving the default would be a same-origin restriction sitting directly behind a CORS config that exists to allow the opposite.
- **`X-Frame-Options` is `DENY` rather than `SAMEORIGIN`.** Nothing here is ever meant to be framed, including by itself.

`Strict-Transport-Security` keeps Hono's default. Browsers ignore it entirely over plain HTTP, so it costs local development nothing and needs no `NODE_ENV` branch.

Session cookie attributes are set by better-auth; see [`packages/auth/README.md`](../../packages/auth/README.md#session-cookie-attributes).
