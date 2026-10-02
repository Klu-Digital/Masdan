# web

The React SPA: TanStack Router and Query on the oRPC client, with shared [coss ui](https://coss.com/ui) primitives from `packages/ui`. In production it is served by nginx, which also proxies the API.

## UI components

coss ui is a Base UI + Tailwind component set distributed through the shadcn CLI. The registry is wired up in `components.json` as `@coss`, and the files are vendored, not installed.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust aliases, registries or style config in `packages/ui/components.json` and `apps/web/components.json`

Add more primitives to the shared package from the project root:

```bash
npx shadcn@latest add @coss/accordion @coss/dialog @coss/popover -c packages/ui

# or re-sync the whole set
npx shadcn@latest add @coss/ui --overwrite -c packages/ui
```

```tsx
import { Button } from "@masdan/ui/components/button";
```

App-specific blocks, rather than shared primitives, are added by running the shadcn CLI from `apps/web`.

## Page titles and breadcrumbs

A screen names itself once. `head()` on the route is the single source for both the document title and the breadcrumb trail. `AppBreadcrumbs` (`src/components/app-breadcrumbs.tsx`) walks the matched routes and takes whichever `meta` entry carries a `title`.

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

- **`loader` has to be written above `head`.** TypeScript resolves the route options object in source order, and with `head` first it has not yet inferred what the loader returns, so `loaderData` widens to `never` and every property access on it fails to compile. This is the one place in the codebase where route options are deliberately not key-sorted. Both dynamic routes carry an `/* oxlint-disable sort-keys */` for it.
- **Always give the fallback a sensible label.** An id that resolves to nothing still renders a crumb; `loaderData?.user?.name ?? "User"` is the difference between a generic trail and one reading "undefined".
- **The loader is what makes the crumb possible, not an extra request.** `ensureQueryData` seeds the same cache entry the component's `useQuery` reads, so the page costs one fetch. The real trade is timing: navigation now waits for the record before it paints rather than flashing a skeleton. That is deliberate, because a breadcrumb that arrives a beat after the page is a layout shift in the header.
- **The root route's title is the product name, not a crumb.** `__root.tsx` sets `title: "masdan"` as the fallback tab title; `AppBreadcrumbs` skips the root match so it never appears in the trail. Every child title overrides it in the tab.
- **`staticData.crumb` is gone.** It could not express a dynamic crumb, and keeping both would mean two places to name a screen.

## nginx and the environment-agnostic image

`VITE_SERVER_URL` defaults to `/`, meaning "the origin that served this page". nginx forwards the prefixes the API mounts (`/api/auth`, `/rpc`, `/feeds/` and the chat webhook path `/chat/<channel>/webhook`) to `SERVER_UPSTREAM`, so the browser only ever talks to one origin. Nothing environment-specific is inlined at build time, which is what lets a single built image be promoted from staging to production rather than rebuilt per environment. `vite.config.ts` proxies the same prefixes so `pnpm dev` runs the same topology.

- **The API needs no public hostname.** It is reachable only through the web origin. `/api-reference` and the Prometheus metrics path are deliberately _not_ proxied, so they stay private. `/api-reference` is not mounted at all when `NODE_ENV=production`.
- **`SERVER_UPSTREAM` goes through a resolver on purpose.** A hostname written literally into `proxy_pass` is resolved once at nginx startup and cached for the process's life, so recreating the API container would leave nginx posting at an address nothing answers on. The variable-plus-`resolver` form re-resolves per request.
- **The server must trust the proxy.** Set `TRUSTED_PROXY_HOPS`; see [`apps/server/README.md`](../server/README.md#client-ip-and-trusted_proxy_hops).

## Security headers

nginx serves the SPA from `nginx.conf.template`, rendered at container start by the nginx image's own envsubst step. It is a template for one reason: the SPA's `connect-src` has to name the origins it talks to, and those are deployment-specific. `CSP_CONNECT_SRC` carries them. The API's own headers are in [`apps/server/README.md`](../server/README.md#security-headers).

Things that bite:

- **`connect-src` needs the object storage endpoint.** The API is same-origin, so `'self'` covers it, but uploads go straight from the browser to a presigned URL. Omitting the bucket breaks uploads and nothing else, a confusing way to find out. `docker-compose.yml` sets it for the local stack.
- **Unsetting `CSP_CONNECT_SRC` is not the same as setting it empty.** envsubst only substitutes variables that exist in the environment, so an unset one stays literal, and nginx then reads `$CSP_CONNECT_SRC` as one of its own variables and refuses to start: `unknown "csp_connect_src" variable`. The Dockerfile's `ENV CSP_CONNECT_SRC=""` is what keeps that from happening. Failing loudly at boot beats shipping a policy with a hole in it.

nginx sends the same `Strict-Transport-Security` value as the API (`max-age=15552000; includeSubDomains`), so the origin has one policy whether a response came from nginx or was proxied. Mind `includeSubDomains` before serving Masdan on an apex domain whose subdomains are not all on HTTPS: it is slow and painful to undo.
