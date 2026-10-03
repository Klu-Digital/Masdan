# Self-hosting Masdan

Everything an operator needs: running the stack, configuring the optional services, and looking after accounts. How the code works is in the READMEs next to it; this page links to them where the reasoning matters.

- [Requirements](#requirements)
- [Run the published images](#run-the-published-images)
- [Build it from source](#build-it-from-source)
- [The first account](#the-first-account)
- [Deployment configuration](#deployment-configuration)
- [Putting it behind a proxy](#putting-it-behind-a-proxy)
- [Object storage](#object-storage)
- [Redis](#redis)
- [AI features](#ai-features)
- [Chat entry (Telegram)](#chat-entry-telegram)
- [Accounts, recovery and invitations](#accounts-recovery-and-invitations)
- [Data export](#data-export)

## Requirements

|  | Needs |
| --- | --- |
| **Required** | Docker and Postgres 18 (both compose files below bring one). Node 26 and pnpm 10+ only to build from source |
| **Optional** | Redis, an S3-compatible bucket, a Cloudflare AI Gateway, a Telegram bot |

Postgres is the system of record: the ledger, sessions and the job queue. Nothing else is needed to run a household.

## Run the published images

The quickest way to run Masdan is the images on Docker Hub. You don't need to clone the repo or install Node. Put this in a `compose.yaml`:

```yaml
services:
  web:
    image: docker.io/k22i/masdan-web:main
    ports:
      - "2600:2600"
    depends_on:
      server:
        condition: service_healthy
    restart: unless-stopped

  server:
    image: docker.io/k22i/masdan-server:main
    environment:
      DATABASE_URL: postgresql://masdan:${POSTGRES_PASSWORD}@postgres:5432/masdan
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      # The address people open Masdan at.
      BETTER_AUTH_URL: http://localhost:2600
      CORS_ORIGIN: http://localhost:2600
      # The web image's nginx sits in front of the server.
      TRUSTED_PROXY_HOPS: 1
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  workers:
    image: docker.io/k22i/masdan-workers:main
    environment:
      DATABASE_URL: postgresql://masdan:${POSTGRES_PASSWORD}@postgres:5432/masdan
    depends_on:
      server:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: masdan
      POSTGRES_USER: masdan
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U masdan"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

Generate the two secrets into a `.env` beside it, then start the stack:

```bash
printf 'POSTGRES_PASSWORD=%s\nBETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -base64 32)" > .env
docker compose up -d --wait
```

Open [http://localhost:2600](http://localhost:2600) and [create the first account](#the-first-account). The server applies database migrations every time it boots, so nothing else needs running.

- **Pin a version for anything you rely on.** `main` follows the latest commit. Every build is also tagged `sha-<7 chars>` (for example `k22i/masdan-server:sha-7351022`), which never moves. Use the same tag for all three images.
- **Updating** is `docker compose pull && docker compose up -d`. The server migrates the database before it starts serving.
- **The images are built for `linux/amd64` only.** On an ARM host such as Apple Silicon or a Raspberry Pi, add `platform: linux/amd64` to the three Masdan services. They then run under emulation, so they are slower.
- **Use HTTPS anywhere but localhost.** The images run in production mode, so the session cookie is `Secure`. Over plain HTTP, browsers only keep it on `localhost`, and Safari not even there. Sign-in then fails silently: every request looks signed out. On a real domain, put a TLS-terminating proxy in front of `web`, set `BETTER_AUTH_URL` and `CORS_ORIGIN` to the `https://` address, and raise `TRUSTED_PROXY_HOPS` to `2`. See [Putting it behind a proxy](#putting-it-behind-a-proxy).
- **The optional services are environment variables.** Add the ones from [Object storage](#object-storage), [Redis](#redis), [AI features](#ai-features) and [Chat entry](#chat-entry-telegram) to `server` and `workers`, plus `CSP_CONNECT_SRC` on `web` when you add storage.
- **The admin CLI is in the server image.** For example: `docker compose exec server pnpm admin:reset-password you@example.com`.

## Build it from source

Building the images yourself also brings up MinIO and Redis locally:

```bash
git clone https://github.com/Klu-Digital/Masdan.git && cd Masdan
pnpm install && pnpm secrets:setup
docker compose up -d --wait postgres && pnpm db:deploy
pnpm docker:up
```

Then open [http://localhost:2600](http://localhost:2600).

`pnpm secrets:setup` creates each app's `.env` and generates the secrets that are safe to generate locally. `pnpm secrets:check` reports what is set and what is missing. Environment variables are read from those files (baked into web builds only for public variables) and overridden in `docker-compose.yml` for container networking.

The stack mirrors production:

- **One published port.** Only the web container publishes one (`WEB_PORT`, container port 2600, because the unprivileged nginx image cannot bind 80). The API is reached through its proxy and needs no public hostname.
- **Three images, all non-root**, each with its own `HEALTHCHECK`: `web` (nginx + the SPA), `server` (the API) and `workers` (the job queue). The server and workers images hold only production dependencies and the bundle.
- **The server migrates its own database on boot** in production. The compose stack skips that, because a local database is usually push-built, which is why the quick start runs `pnpm db:deploy` itself. Details in [`apps/server/README.md`](../apps/server/README.md#boot-and-migrations).

`pnpm docker:logs` tails the stack and `pnpm docker:down` stops it. Set `SERVER_PORT` / `WEB_PORT` in a root `.env` to remap both the published ports and the wiring between services.

The web image is environment-agnostic: nothing deployment-specific is baked in at build time, so the same build runs anywhere and is promoted from staging to production rather than rebuilt ([why](../apps/web/README.md#nginx-and-the-environment-agnostic-image)). That is also what makes the [published images](#run-the-published-images) usable as they are.

## The first account

**Sign-up is closed by default.** The first account on an empty database bootstraps the instance and becomes platform admin. Create yours before the instance is reachable by anyone else: whoever signs up first owns it. After that, new accounts come only from household invite links. Set `ALLOW_SIGNUP=true` to open sign-up.

## Deployment configuration

The same setup command takes an environment:

```bash
pnpm secrets:setup --environment staging
pnpm secrets:check --environment staging
```

The wizard asks provider by provider, decides which values are GitHub Secrets, GitHub Variables or Dokploy runtime variables, shows you the destinations before it writes anything, then applies and verifies. Deployment secrets are held in memory and written straight to GitHub and Dokploy, never to a local file. Rerunning it resumes: names that already exist remotely are skipped, never rotated. Runtime validation lives in `packages/env`.

## Putting it behind a proxy

| Variable | Notes |
| --- | --- |
| `TRUSTED_PROXY_HOPS` | How many proxies sit in front of the server: `1` for the web image's nginx alone, `2` with Traefik or a load balancer in front of that. Too low and every caller shares a proxy's address; too high and callers can pick their own. Defaults to `0`. [Why](../apps/server/README.md#client-ip-and-trusted_proxy_hops) |
| `SERVER_UPSTREAM` | Where the web image's nginx forwards API traffic |
| `CSP_CONNECT_SRC` | Extra origins for the SPA's `connect-src`. **Must include your object storage endpoint**, or uploads break and nothing else does. [Why](../apps/web/README.md#security-headers) |

Both tiers send `Strict-Transport-Security` with `includeSubDomains`. Think twice before serving Masdan on an apex domain whose subdomains are not all on HTTPS: it is slow and painful to undo.

## Object storage

Receipts and attachments go straight from the browser to an S3-compatible bucket through presigned URLs. Any backend works: MinIO locally, AWS S3, Cloudflare R2 or Tigris in production.

| Variable | Notes |
| --- | --- |
| `S3_BUCKET` | Uploads are disabled unless this and both credentials are set |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |  |
| `S3_REGION` | Defaults to `auto` (right for R2; use a real region on AWS) |
| `S3_ENDPOINT` | Server → bucket. Omit on real AWS S3 |
| `S3_PUBLIC_ENDPOINT` | Host baked into presigned URLs. Defaults to `S3_ENDPOINT` |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO, `false` for R2, irrelevant on AWS |
| `STORAGE_MAX_UPLOAD_BYTES` | Defaults to 25 MiB |

On S3 or R2, add a one-time bucket CORS rule allowing `PUT` from your web origin and exposing `ETag`. The server's CORS config does not cover the bucket. More in [`packages/storage/README.md`](../packages/storage/README.md).

## Redis

Optional. It backs the cache and shares rate limits across processes. With `REDIS_URL` unset, rate limits count in each process's memory and the cache is a pass-through, so a Redis outage is never an auth outage.

| Variable | Notes |
| --- | --- |
| `REDIS_URL` | Everything in this section is disabled unless this is set |
| `REDIS_KEY_PREFIX` | Prefixes every key. Set it when several environments share one instance |
| `AUTH_RATE_LIMIT_ENABLED` | better-auth's own default is production-only; this opts in or out explicitly |
| `AUTH_RATE_LIMIT_WINDOW` | Seconds. Defaults to `10` |
| `AUTH_RATE_LIMIT_MAX` | Defaults to `100` |

Alert on the `redis.error` and `ratelimit.fallback` log events. More in [`packages/redis/README.md`](../packages/redis/README.md).

## AI features

Optional. Masdan works fully without them. When enabled, the relevant data is sent to the provider you choose, through a Cloudflare AI Gateway.

| Variable | Notes |
| --- | --- |
| `CLOUDFLARE_AI_GATEWAY_URL` | The gateway's OpenAI-compatible base URL, ending in `/compat` |
| `CLOUDFLARE_AI_GATEWAY_TOKEN` | Required by an authenticated gateway |
| `AI_PROVIDER_API_KEY` | Upstream provider key. Omit when the gateway supplies its own |
| `QUICK_TRANSACTION_AI_MODEL` | `provider/model` for quick entry from free text |
| `RECEIPT_AI_MODEL` | A vision-capable `provider/model` for receipt photos |
| `CATEGORIZE_AI_MODEL` | `provider/model` for category suggestions |
| `ASK_MASDAN_AI_MODEL` | `provider/model` for Ask Masdan |
| `AI_DAILY_TOKEN_BUDGET` | Tokens each household, and each person, may spend per UTC day. Defaults to `500000`; `0` turns AI off |

An unset model turns that one feature's AI off. Categorization and Ask Masdan are also behind feature flags (`FF__AI_CATEGORIZATION`, `FF__ASK_MASDAN`) that a platform admin toggles at `/admin/flags`.

## Chat entry (Telegram)

Lets a linked member add a transaction, or send a receipt photo, by messaging a bot.

1. Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` in both `apps/server/.env` and `apps/workers/.env`. Set `TELEGRAM_WEBHOOK_SECRET` in the server's (`pnpm secrets:setup` generates it) and `CHAT_APP_URL` in the workers'. The workers also need the [AI variables](#ai-features), and storage for receipts.
2. Expose **only** `/chat/<channel>/webhook` publicly, through a reverse proxy scoped to that path: a Cloudflare Tunnel ingress rule with `path: ^/chat/[a-z]+/webhook$` and a catch-all `http_status:404`, a Tailscale Funnel on that path, or a dedicated nginx `server` block. Everything else stays private.
3. Register the webhook: `pnpm telegram:webhook set https://<public-origin>` sets it with its secret token, and `pnpm telegram:webhook info` shows its state.
4. Turn on `FF__CHAT_ENTRY` at `/admin/flags`. Members link from **Settings → Household → Chat apps** by sending the bot `/link <code>`. Codes are single-use and valid for 10 minutes.

How it works, and how to add another channel: [`packages/api/src/chat/README.md`](../packages/api/src/chat/README.md).

## Accounts, recovery and invitations

Masdan **sends no email**. Recovery is admin-driven, with shell access to the server as the root of trust.

- **Invitations are links.** An invitation's email is only a label. The inviter copies the link from household settings and sends it themselves, and whoever holds it can join with the invited role until it expires or is cancelled. Each link admits one new account; anyone else holding it can still join with an existing account.
- **A platform admin resets passwords** from `/admin/users/<id>` → Password. That creates a one-time link, valid for 24 hours, which the admin hands over out of band. Completing it signs the user out everywhere.
- **A locked-out lone admin uses the CLI.** `pnpm admin:reset-password <email>` prompts for a new password (empty generates one) and revokes the account's sessions. `pnpm admin:grant <email>` makes an existing account platform admin. Both work locally or inside the server container (Dokploy's terminal or `docker exec`), where they run a bundled copy.
- **Forgot password** still works as a fallback for whoever runs the server: the reset link is written to the server's raw stdout (`docker logs`), never to the structured logger.

Why reset links are kept out of the logs: [`packages/auth/README.md`](../packages/auth/README.md#recovery-and-sign-up-internals).

## Data export

Households download their records as CSV from **Settings → Household → Export data**: transactions, splits, transaction tags, transfers, accounts, balance history, credit-card statements, categories and tags. Each export covers only the active household. Archived rows are included and carry `archived_at`. Amounts are exact numeric text, and free-text cells that start with `= + - @` get a leading `'` to block spreadsheet formula injection.

Column reference and format rules: [`packages/api/src/exports/README.md`](../packages/api/src/exports/README.md).
