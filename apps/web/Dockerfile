# Base images are pinned by digest, not just tag. `node:24` and `nginx:alpine`
# both float: the same Dockerfile built a week apart can pull a different Node
# patch or a different Alpine, which is exactly the drift that makes a staging
# build and a production rebuild of one commit not the same artifact. Keep the
# readable tag alongside the digest; refresh both together with
# `docker buildx imagetools inspect <tag>`. The Node major must stay in step with
# .github/actions/setup-workspace/action.yml.
FROM node:24@sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0 AS builder
WORKDIR /app
# The pnpm version comes from `packageManager`, so package.json stays the one
# place it is bumped — the same one CI's pnpm/action-setup reads.
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile --store-dir /pnpm-store

# Defaults to same-origin, which is what makes this image environment-agnostic:
# "/" resolves against window.location.origin at runtime, so one build promotes
# from staging to production unchanged. Override only for a deployment that
# genuinely serves the API on another host.
ARG VITE_SERVER_URL=/
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV NODE_ENV=production
RUN cd apps/web && pnpm run build

# The unprivileged variant runs as uid 101 and so listens on 8080, not 80.
FROM nginxinc/nginx-unprivileged:alpine@sha256:26b0bf6fbf07297983cb341998d79c831508787de26627dd2a112321b9c3a4af AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
# Not conf.d: the nginx image renders everything in /etc/nginx/templates through
# envsubst into /etc/nginx/conf.d on startup, which is how ${CSP_CONNECT_SRC}
# reaches the config. A file dropped straight into conf.d would skip that step.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
# Substituted into the CSP. Empty by default, which yields `connect-src 'self'`
# — enough for the API now that it is same-origin, but not for the object storage
# endpoint, so uploads need this set wherever this image is deployed.
ENV CSP_CONNECT_SRC=""
# Where nginx proxies /api/auth and /rpc. Needs a value for the same reason
# CSP_CONNECT_SRC does — envsubst leaves an *unset* variable literal and nginx
# then refuses to start on `unknown "server_upstream" variable` — but unlike the
# CSP an empty upstream is simply a broken proxy, so the default is the compose
# service name rather than "".
ENV SERVER_UPSTREAM="http://server:1900"
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]

CMD ["nginx", "-g", "daemon off;"]
