# @masdan/redis

Redis backs three things: better-auth's own rate limiter, an oRPC `rateLimit()` middleware for our own procedures (plus chat entry's per-sender and link-code limits), and a `createCache()` primitive used at call sites throughout the API.

It is **optional**. With `REDIS_URL` unset the server boots exactly as before: every rate limit counts in process memory instead, and the cache becomes a pass-through. Sessions are deliberately **not** in Redis; see below.

The variables are listed in [docs/self-hosting.md](../../docs/self-hosting.md#redis).

## Local container

```bash
pnpm run redis:start
docker exec -it masdan-redis redis-cli
```

The host port is **6666**, not Redis's default 6379. The container-internal port is still 6379, which is why the compose-network `REDIS_URL` on the `server` service reads `redis://redis:6379`.

## Cache

`createCache(namespace)` returns `get` / `set` / `del` / `remember`, all namespaced under `${namespace}:`:

```ts
const orgCache = createCache("org");
const org = await orgCache.remember(orgId, 60, () => loadOrg(orgId));
```

Every method swallows Redis failures by design. A down or unreachable Redis degrades `get` to a miss, `set`/`del` to no-ops, and `remember` to calling `fn` directly. There is no stampede protection: concurrent callers that miss the same key all call `fn` and all write the result. Caching is an optimization here, not a dependency.

## Things that bite

- **Rate limiting falls back to process memory; only the cache fails open.** Every limiter here guards security (sign-in, link codes) or AI spend, so none may vanish with Redis. `countHit` counts in Redis when it answers and in an in-process fixed window when it is unset or a command fails, logging `ratelimit.fallback`. Nothing is rejected because Redis is down, so a Redis outage is not an auth outage. The cost: the fallback is per process, so N replicas allow N times the limit, and a restart resets it. Alert on `redis.error` and `ratelimit.fallback`.
- **Sessions are deliberately not in Redis.** better-auth's `secondaryStorage` is a _different_ option from `rateLimit.customStorage`, and turning it on stops better-auth from writing the Postgres `session` row at all. That breaks the `activeOrganizationId` repair in `packages/auth/src/index.ts`'s `user.create.after` hook and 403s every newly signed-up user out of `requireOrganization`. To cut the per-request session query in `packages/api/src/context.ts`, evaluate better-auth's `session.cookieCache`, not `secondaryStorage`. `packages/auth/src/personal-organization.db.test.ts` is the regression test.
- **Cache invalidation inside a mutation runs inside an open transaction.** `mutationProcedure` wraps handlers in `db.transaction(...)`, so a `cache.del()` called directly from a handler purges a key the transaction may still roll back. Use `context.afterCommit(...)` instead (see its docblock in `packages/api/src/procedures.ts`):

  ```ts
  createUpload: mutationProcedure.handler(async ({ context, input }) => {
    const row = await context.db.insert(file).values(/* ... */).returning();
    context.afterCommit(() => cache.del(`org:${context.organizationId}:files`));
    return row;
  }),
  ```

- **The client IP comes from the server, not from better-auth.** See [`apps/server/README.md`](../../apps/server/README.md#client-ip-and-trusted_proxy_hops).
- **`REDIS_KEY_PREFIX` is not test isolation.** Test workers each get their own numbered Redis logical database (`redis://…/N`, derived from `VITEST_POOL_ID`) and a `FLUSHDB` between tests. Never point the suite at a Redis you care about.
