# Base images are pinned by digest, not just tag. `node:24` and `nginx:alpine`
# both float: the same Dockerfile built a week apart can pull a different Node
# patch or a different Alpine, which is exactly the drift that makes a staging
# build and a production rebuild of one commit not the same artifact. Keep the
# readable tag alongside the digest; refresh both together with
# `docker buildx imagetools inspect <tag>`. The Node major must stay in step with
# .github/actions/setup-workspace/action.yml.
FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS base
WORKDIR /app
# The pnpm version comes from `packageManager`, so package.json stays the one
# place it is bumped — the same one CI's pnpm/action-setup reads.
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

FROM base AS builder
COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile --store-dir /pnpm-store

RUN cd apps/workers && SKIP_ENV_VALIDATION=1 NODE_ENV=production pnpm run build

# Production dependencies and the bundle only. `@masdan/*` are devDependencies
# because tsdown inlines them; as dependencies they would drag their own deps
# (drizzle-kit) in here. pnpm 10 deploys a workspace package only when workspace
# packages are injected; enabling that just for this command leaves local dev
# linking alone.
RUN --mount=type=cache,target=/pnpm-store pnpm --config.inject-workspace-packages=true deploy --filter=workers --prod --store-dir /pnpm-store /prod/workers

FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS runner
WORKDIR /app
ENV NODE_ENV=production
# Root-owned and run as `node`: the process cannot rewrite its own code.
COPY --from=builder /prod/workers /app
USER node

EXPOSE 1901

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.WORKERS_PORT ?? 1901}/`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/index.mjs"]
