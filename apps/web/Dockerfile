# Base images are pinned by digest, not just tag. `node:24` and `nginx:alpine`
# both float: the same Dockerfile built a week apart can pull a different Node
# patch or a different Alpine, which is exactly the drift that makes a staging
# build and a production rebuild of one commit not the same artifact. Keep the
# readable tag alongside the digest; refresh both together with
# `docker buildx imagetools inspect <tag>`. The Node major must stay in step with
# .github/actions/setup-workspace/action.yml.
FROM node:24@sha256:6dac556d980b7f0e5498d08f08cee0ca67798b4ad6c23964a9214920e67758d0 AS builder
RUN npm install -g pnpm@11
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --store-dir /pnpm-store

# Defaults to same-origin, which is what makes this image environment-agnostic:
# "/" resolves against window.location.origin at runtime, so one build promotes
# from staging to production unchanged. Override only for a deployment that
# genuinely serves the API on another host.
ARG VITE_SERVER_URL=/
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV NODE_ENV=production
RUN cd apps/web && pnpm run build

FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3 AS runner
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
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
