# Feature flags

Flags are _declared_ in code and _valued_ in the database, so turning one on is a click at `/admin/flags` rather than a deploy. Declare one in `packages/env/src/flags.ts`:

```ts
export const featureFlagRegistry = {
  FF__NEW_THING: {
    defaultEnabled: false,
    description: "What turning it on does, shown in the admin UI.",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
```

That is the whole setup: no migration, no seed, no env var. A flag with no row in `feature_flag` resolves to its `defaultEnabled`, and a row appears the first time an admin toggles it.

In an authenticated web route:

```tsx
const showNewThing = useFeatureFlag("FF__NEW_THING");
```

On the server, read through the resolver in `@masdan/api/feature-flags`. It needs a `db` because the value lives in a table, and it is cached per process, so this is a map lookup on all but one call in thirty:

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

`requireFlag` needs only `db` from the context, which every rung has, so it composes onto any procedure: public, protected, or org-scoped. A flagged-off procedure answers `NOT_FOUND` rather than `FORBIDDEN`, since `FORBIDDEN` would confirm the endpoint exists.

Names are typed against the registry: a typo is a compile error at a call site and a `BAD_REQUEST` at the API, not a silent `false`.

## Things to know

- **A toggle takes up to 30 seconds to reach every server.** Each process caches the table read for `FEATURE_FLAG_TTL_MS`; the instance that handled the toggle invalidates its own cache once the transaction commits, and the rest catch up within the TTL. The web client mirrors the same window, so an open tab picks a change up without a reload.
- **Reading is for anyone signed in; writing is platform-admin only.** `featureFlags.all` is a `protectedProcedure`, because the web app needs it to decide what to render, while `admin.featureFlags.set` / `.reset` sit behind `adminMutationProcedure` on the global `user.role`.
- **Adding a flag is still a deploy.** Only its value moved to the database. Declaring a flag is a code change on purpose: it is what keeps `FeatureFlagName` a typed union and `rg FF__NEW_THING` a complete answer.
- **Flags are global.** No per-user targeting and no percentage rollouts. If you need either, replace this with a real flag platform rather than extending it.
- **`useFeatureFlag` only works signed in.** `featureFlags.all` is a `protectedProcedure`, so calling the hook outside `src/routes/_auth/*` fails with `UNAUTHORIZED` and toasts at the user.
- **Only declared flags are returned.** Reads walk the registry rather than returning whatever rows the table holds, so deleting a flag from code leaves an orphan row that nothing resurrects.
- **Hiding UI is not gating.** `useFeatureFlag` only decides what renders; the procedure behind it stays callable by anyone who knows its name. Reach for `requireFlag` whenever the flag is protecting unreleased work rather than just tidying the UI.
- **Auth is checked before the flag.** On `protectedProcedure.use(requireFlag(...))` a signed-out caller gets `UNAUTHORIZED`, never `NOT_FOUND`, so an anonymous probe cannot tell a flagged-off procedure from a flagged-on one.
- **A flag read fails open to the last known values.** If the query fails, the resolver serves its cached values (or the declared defaults on a cold cache) and logs `featureflags.read.failed` rather than turning a degraded database into a 500 on every gated route.
