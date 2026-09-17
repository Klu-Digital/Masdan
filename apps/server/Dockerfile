# Base images are pinned by digest, not just tag. `node:24` and `nginx:alpine`
# both float: the same Dockerfile built a week apart can pull a different Node
# patch or a different Alpine, which is exactly the drift that makes a staging
# build and a production rebuild of one commit not the same artifact. Keep the
# readable tag alongside the digest; refresh both together with
# `docker buildx imagetools inspect <tag>`. The Node major must stay in step with
# .github/actions/setup-workspace/action.yml.
FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS builder
RUN npm install -g pnpm@11
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

ENV NODE_ENV=production
RUN cd apps/server && pnpm run build

FROM node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 1900

WORKDIR /app/apps/server
CMD ["node", "dist/index.mjs"]
