# Authorization (RBAC)

Roles and permissions for this template. Everything is built on better-auth's `access` module — **no `roles` / `permissions` / `role_permissions` tables, and no migration to adopt it.**

Nothing in the template needs authorizing yet beyond object storage; the storage router is wired up as a worked example so the pattern is visible from day one.

---

## The two axes — get this right first

There are two independent role columns, and conflating them is the most common way this goes wrong.

|  | Platform axis | Tenant axis |
| --- | --- | --- |
| Column | `user.role` (from the `admin()` plugin) | `member.role` (from the `organization()` plugin) |
| Scope | Global — one value per human | Per-organization — one value per membership |
| Answers | "Is this person staff? Banned? Impersonating?" | "What can they do **in this workspace**?" |
| Values | `user`, `admin` | `owner`, `admin`, `member`, `viewer` |

**Almost every product permission belongs on the tenant axis.** This app is multi-tenant by construction — every user gets a personal organization on sign-up — so "can X do Y" is nearly always scoped to an organization. Keep `user.role` for your own back-office and support powers.

Everything below is about the tenant axis. It is what `requirePermission` reads.

---

## The four layers

```
packages/auth/src/permissions.ts     statements + roles     ← pure data, shared everywhere
              ↓
organization({ ac, roles })          better-auth gates its own endpoints
              ↓
requirePermission() in @masdan/api     your routes are gated
              ↓
authClient / hasPermission()         the UI hides controls it would 403 on
```

Each layer has one job, and the definitions in step 1 are the only place a role is described.

---

## Adding a permission

### 1. Extend the vocabulary

In [`src/permissions.ts`](./src/permissions.ts):

```ts
export const statement = {
  ...defaultStatements,
  attachment: ["create", "read", "delete", "delete:any"],
  invoice: ["read", "create", "void"], // ← new resource
} as const;
```

Then grant it to whichever roles should have it:

```ts
export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    attachment: ["create", "read", "delete", "delete:any"],
    invoice: ["read", "create", "void"],
  }),
  member: ac.newRole({
    ...memberAc.statements,
    attachment: ["create", "read", "delete"],
    invoice: ["read"],
  }),
  // ...
};
```

`createAccessControl` makes this subsetting a **compile-time** check. A resource that isn't in `statement`, or an action that isn't in that resource's list, fails `pnpm check-types` rather than silently granting nothing.

Always spread `ownerAc` / `adminAc` / `memberAc`. They carry better-auth's own statements (`organization`, `member`, `invitation`, `team`, `ac`); drop them and you silently strip owners of the ability to invite members or delete their org.

### 2. Gate the route

In a router, on top of `orgProcedure` or `orgMutationProcedure`:

```ts
import { orgProcedure, requirePermission } from "../index";

listInvoices: orgProcedure
  .use(requirePermission({ invoice: ["read"] }))
  .handler(async ({ context }) => { /* ... */ }),
```

That's it. `requireOrganization` has already resolved the caller's `member.role` for the active organization, so the check is in-memory set math — no extra query per procedure.

### 3. Mirror it in the UI

```tsx
import { hasPermission } from "@masdan/auth/permissions";
import { authClient } from "@/lib/auth-client";

const { data: session } = authClient.useSession();
const role = /* the active member's role — see "Getting the role client-side" */;

{hasPermission({ role, permissions: { invoice: ["void"] } }) && <VoidButton />}
```

This is a **rendering decision, not an authorization decision.** The server middleware is the enforcement point; the client check only avoids showing buttons that would come back 403.

---

## Semantics you need to know

### Checks are ANDed, and empty means denied

```ts
requirePermission({ invoice: ["read", "void"] }); // needs BOTH actions
requirePermission({ invoice: ["read"], attachment: ["read"] }); // needs both resources
requirePermission({}); // ← denies EVERYONE, including owners
```

The empty case is deliberate and worth relying on: a check that gets emptied out by a refactor locks the route rather than opening it. It fails closed.

For an either-or on one resource, use the connector form:

```ts
requirePermission({
  invoice: { actions: ["void", "delete"], connector: "OR" },
});
```

For an either-or across _resources_, prefer defining a role that has both — it reads better and keeps the vocabulary honest.

### Multiple roles are comma-separated

better-auth stores `member.role` as a comma-separated list (`"viewer,billing"`), and grants are unioned across them. `hasPermission` handles this; don't compare `member.role` to a string yourself anywhere.

### Unknown roles are denied

A `member.role` value with no matching entry in `roles` grants nothing. Deleting a role from `permissions.ts` therefore locks out anyone still holding it rather than crashing — check for stragglers before you remove one:

```sql
SELECT role, count(*) FROM "member" GROUP BY role;
```

### Roles are sets, not ranks

Do not add a hierarchy (`admin > member > viewer`) or numeric levels. It feels tidy right up until you need "a billing admin who can't read files," and then it has to be unwound everywhere. Permission _sets_ compose; ranks don't.

---

## Ownership: the `:any` convention

RBAC answers "may this role do this at all." It cannot express "…to their own rows." Rather than bolt on a policy engine, the vocabulary carries a second action and the ownership comparison stays in the handler, next to the row:

```ts
deleteFile: orgMutationProcedure
  .use(requirePermission({ attachment: ["delete"] }))   // may delete files at all
  .input(fileIdInput)
  .handler(async ({ context, input }) => {
    const [target] = await context.db.select({ userId: file.userId })/* ... */;
    if (!target) throw new ORPCError("NOT_FOUND", { message: "File not found" });

    if (target.userId !== context.session.user.id) {
      assertPermission(context, { attachment: ["delete:any"] });   // ...someone else's
    }
    // ...
  }),
```

See [`packages/api/src/files/files.router.ts`](../api/src/files/files.router.ts) for the full version. Use `requirePermission` (middleware) when the route alone decides, and `assertPermission` (expression) when the row decides.

---

## Getting the role

**Server-side**, `orgProcedure` puts it on the context for you:

```ts
context.organizationId; // string
context.memberRole; // string — the raw member.role, may be comma-separated
```

**Client-side**, ask better-auth for the active member:

```ts
const { data } = await authClient.organization.getActiveMember();
const role = data?.role ?? "";
```

or use the plugin's own single-role helper, which is wired to the same `ac` and `roles`:

```ts
authClient.organization.checkRolePermission({
  role: "member",
  permissions: { attachment: ["delete:any"] },
});
```

Prefer `hasPermission` from `@masdan/auth/permissions` when the value came from `getActiveMember`, since it handles the comma-separated case.

---

## Changing someone's role

```ts
await authClient.organization.updateMemberRole({
  memberId,
  role: "admin",
  organizationId, // optional; defaults to the active one
});
```

Gated by better-auth itself on `member: ["update"]`, which `owner` and `admin` have and `member` / `viewer` do not.

Because `requireOrganization` reads `member.role` on **every request**, a demotion takes effect immediately — there is no session to invalidate. That is the reason the lookup is a query rather than a value baked into the session at login. Don't "optimize" it into the session token without accepting stale-permission bugs.

---

## Testing

Two levels, both already present:

- [`src/permissions.test.ts`](./src/permissions.test.ts) — the role matrix as pure data. Fast, no database. Add a case here when you add a role or a resource.
- [`packages/api/src/procedures-permissions.db.test.ts`](../api/src/procedures-permissions.db.test.ts) — the middleware end to end: sign up a real user, write a role onto their `member` row, assert `FORBIDDEN`.

The useful trick in the integration test is distinguishing **FORBIDDEN** (the gate rejected you) from **NOT_FOUND** (you got past the gate and the handler ran). Assert on the code, not just that it threw.

```bash
pnpm test:unit && pnpm test:db
```

---

## When you outgrow static roles

better-auth supports roles defined at runtime by customers themselves — `organization({ dynamicAccessControl: { enabled: true } })`, which adds an `organizationRole` table (`organizationId`, `role`, `permission` JSON) and the `create-role` / `update-role` / `list-roles` endpoints.

It is a real escape hatch, and it costs you a table, an admin UI, and the compile-time checking above. **Start static.** Turn it on when a customer actually asks to define their own roles, not in anticipation.

---

## Rate limiting

better-auth's built-in rate limiter counts through `countHit` from `@masdan/redis`, via `rateLimit.customStorage` in [`src/index.ts`](./src/index.ts): in Redis when it answers, in process memory when `REDIS_URL` is unset or Redis is down — see [`src/rate-limit-storage.ts`](./src/rate-limit-storage.ts). A Redis outage never lifts the limit and never rejects a sign-in; it only makes the count per process. better-auth enables it in production by default (`enabled ?? isProduction`); `AUTH_RATE_LIMIT_ENABLED` overrides that explicitly in either direction.

**Sessions stay in Postgres. Do not turn on `secondaryStorage`.** It looks like the natural place to point better-auth at Redis, but it is a different setting from `rateLimit.customStorage`, and it changes different behavior: with `secondaryStorage` set, better-auth stops writing the Postgres `session` row at all (the default `session.storeSessionInDatabase: false`). That breaks the `activeOrganizationId` repair in the `user.create.after` hook in [`src/index.ts`](./src/index.ts) — the UPDATE it issues against the `session` table becomes invisible to `findSession`, which would read Redis first — and every newly signed-up user gets 403'd out of `requireOrganization`. `packages/auth/src/personal-organization.db.test.ts` is the regression test that catches this. See [`src/rate-limit-storage.ts`](./src/rate-limit-storage.ts) for the full writeup.

---

## Session cookie attributes

`defaultCookieAttributes` in [`src/index.ts`](./src/index.ts) answers two independent questions, and keeping them independent is the point.

`Secure` follows **deployment**: on in `production` and `staging`, off everywhere else. `SameSite` follows **topology**: it compares the sites of `BETTER_AUTH_URL` and `CORS_ORIGIN` and answers `Lax` when they match, `None` only when they genuinely differ and the environment is deployed. Under the default same-origin setup that means `SameSite=Lax; Secure` in production, the tighter pair, with CSRF protection the cross-site version gives up. Split the API back onto its own host and it returns `None` on its own, no code change. `/rpc` does not lean on `SameSite` alone: oRPC's `SimpleCsrfProtectionHandlerPlugin` refuses any call without an `x-csrf-token` header, which a cross-site page can only send after a CORS preflight that `CORS_ORIGIN` refuses. Every `RPCLink`, tests included, needs `SimpleCsrfProtectionLinkPlugin`.

Deriving both from one flag, as this did before, is the trap: the day the topology becomes same-site in production is the day the cookie also stops being `Secure`. `None` without `Secure` is illegal anyway, so the two must move separately.

Sending `None; Secure` everywhere appears to work locally because Chrome and Firefox special-case `http://localhost` and accept `Secure` cookies over it. Safari does not, and neither extends that exception to a dev server reached over a LAN IP, the usual way to open the web app on a real phone. The failure is silent: the cookie is dropped and every request looks signed out. A port is not part of a _site_, so `localhost:2600` and `localhost:1900` are same-site regardless.

---

## Recovery and sign-up internals

How recovery works for an operator is in [docs/self-hosting.md](../../docs/self-hosting.md#accounts-recovery-and-invitations). Two things that bite when changing it:

- **A reset link must never reach `log`.** Structured logs drain to PostHog when `POSTHOG_PROJECT_API_KEY` is set, so a logged link is an account takeover handed to a third party. Delivery goes through `deliver()` in [`src/deliver.ts`](./src/deliver.ts), the one place optional SMTP would slot in. Links point straight at the web page, because better-auth's own `/api/auth/reset-password/<token>` redirect puts the token in a path the request logger records.
- **The sign-up gate only guards HTTP.** Server-side `auth.api.signUpEmail` calls (the seeder, `signUpTestUser`) carry no request and bypass it, and so never mint a bootstrap admin.

---

## Files

| File | What it holds |
| --- | --- |
| `packages/auth/src/permissions.ts` | Statements, roles, `hasPermission`. Edit this first. |
| `packages/auth/src/index.ts` | Passes `ac` / `roles` into `organization()`. |
| `packages/api/src/procedures.ts` | `requireOrganization`, `requirePermission`, `assertPermission`. |
| `apps/web/src/lib/auth-client.ts` | Client mirror (web). |

`permissions.ts` is imported by the browser. Keep it free of `@masdan/db`, `@masdan/env`, and anything else server-only.
