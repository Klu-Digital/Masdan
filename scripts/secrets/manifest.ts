export type ConfigKind = "generated-secret" | "provider-secret" | "config";

export type ConfigTarget =
  | "local-server"
  | "local-workers"
  | "local-web"
  | "local-native"
  | "github-repository"
  | "github-staging"
  | "github-production"
  | "dokploy-server"
  | "dokploy-workers";

export interface ConfigEntry {
  name: string;
  kind: ConfigKind;
  description: string;
  required: boolean;
  targets: ConfigTarget[];
}

/** Setup metadata only. Runtime validation remains in packages/env. */
export const configManifest = [
  {
    description:
      "Upstream AI provider key, when Cloudflare AI Gateway does not store it",
    kind: "provider-secret",
    name: "AI_PROVIDER_API_KEY",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "provider/model used to answer Ask Masdan questions",
    kind: "config",
    name: "ASK_MASDAN_AI_MODEL",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Whether Better Auth rate limiting is enabled",
    kind: "config",
    name: "AUTH_RATE_LIMIT_ENABLED",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Maximum requests per rate-limit window",
    kind: "config",
    name: "AUTH_RATE_LIMIT_MAX",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Rate-limit window in seconds",
    kind: "config",
    name: "AUTH_RATE_LIMIT_WINDOW",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Signs Better Auth sessions and tokens",
    kind: "generated-secret",
    name: "BETTER_AUTH_SECRET",
    required: true,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Public URL used by Better Auth",
    kind: "config",
    name: "BETTER_AUTH_URL",
    required: true,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description:
      "Authenticated Cloudflare AI Gateway token (cf-aig-authorization)",
    kind: "provider-secret",
    name: "CLOUDFLARE_AI_GATEWAY_TOKEN",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Cloudflare AI Gateway OpenAI-compatible base URL",
    kind: "config",
    name: "CLOUDFLARE_AI_GATEWAY_URL",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Browser origin allowed to call the API",
    kind: "config",
    name: "CORS_ORIGIN",
    required: true,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "PostgreSQL connection string",
    kind: "provider-secret",
    name: "DATABASE_URL",
    required: true,
    targets: [
      "local-server",
      "local-workers",
      "github-staging",
      "github-production",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Dokploy API token for deployment requests",
    kind: "provider-secret",
    name: "DOKPLOY_TOKEN",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Dokploy API origin",
    kind: "config",
    name: "DOKPLOY_URL",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Dokploy web application identifier",
    kind: "config",
    name: "DOKPLOY_WEB_APPLICATION_ID",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Dokploy server application identifier",
    kind: "config",
    name: "DOKPLOY_SERVER_APPLICATION_ID",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Dokploy workers application identifier",
    kind: "config",
    name: "DOKPLOY_WORKERS_APPLICATION_ID",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "API origin used by the native app",
    kind: "config",
    name: "EXPO_PUBLIC_SERVER_URL",
    required: true,
    targets: ["local-native"],
  },
  {
    description: "Runtime environment name",
    kind: "config",
    name: "NODE_ENV",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "PostgreSQL schema owned by pg-boss",
    kind: "config",
    name: "PGBOSS_SCHEMA",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "github-staging",
      "github-production",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "API HTTP port",
    kind: "config",
    name: "PORT",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "PostHog deployment or region host",
    kind: "config",
    name: "POSTHOG_HOST",
    required: false,
    targets: ["local-server", "github-repository", "dokploy-server"],
  },
  {
    description: "CI-only PostHog credential for source-map uploads",
    kind: "provider-secret",
    name: "POSTHOG_PERSONAL_API_KEY",
    required: false,
    targets: ["github-repository"],
  },
  {
    description: "PostHog project key used for runtime ingestion",
    kind: "provider-secret",
    name: "POSTHOG_PROJECT_API_KEY",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Non-secret PostHog project identifier",
    kind: "config",
    name: "POSTHOG_PROJECT_ID",
    required: false,
    targets: ["github-repository"],
  },
  {
    description: "Optional metrics endpoint path",
    kind: "config",
    name: "PROMETHEUS_METRICS_PATH",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Bearer token protecting Prometheus metrics",
    kind: "generated-secret",
    name: "PROMETHEUS_METRICS_TOKEN",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Whether pg-boss uses PostgreSQL notifications",
    kind: "config",
    name: "QUEUE_LISTEN_NOTIFY",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Maximum pg-boss connections per process",
    kind: "config",
    name: "QUEUE_POOL_MAX",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "provider/model used to parse quick transaction entries",
    kind: "config",
    name: "QUICK_TRANSACTION_AI_MODEL",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Prefix for Redis keys",
    kind: "config",
    name: "REDIS_KEY_PREFIX",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Optional Redis connection string",
    kind: "provider-secret",
    name: "REDIS_URL",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "Object-storage access key",
    kind: "provider-secret",
    name: "S3_ACCESS_KEY_ID",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Object-storage bucket name",
    kind: "config",
    name: "S3_BUCKET",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Server-to-bucket endpoint",
    kind: "config",
    name: "S3_ENDPOINT",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Use path-style object-storage URLs",
    kind: "config",
    name: "S3_FORCE_PATH_STYLE",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Bucket endpoint embedded in browser upload URLs",
    kind: "config",
    name: "S3_PUBLIC_ENDPOINT",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Object-storage region",
    kind: "config",
    name: "S3_REGION",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Object-storage secret access key",
    kind: "provider-secret",
    name: "S3_SECRET_ACCESS_KEY",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Service name attached to log records",
    kind: "config",
    name: "SERVICE_NAME",
    required: false,
    targets: [
      "local-server",
      "local-workers",
      "dokploy-server",
      "dokploy-workers",
    ],
  },
  {
    description: "URL checked after deployment",
    kind: "config",
    name: "SMOKE_URL",
    required: false,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Maximum object upload size",
    kind: "config",
    name: "STORAGE_MAX_UPLOAD_BYTES",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Trust proxy headers for client IP resolution",
    kind: "config",
    name: "TRUST_PROXY_HEADERS",
    required: false,
    targets: ["local-server", "dokploy-server"],
  },
  {
    description: "Tailscale GitHub OIDC audience",
    kind: "provider-secret",
    name: "TS_AUDIENCE",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "Tailscale GitHub OIDC client identifier",
    kind: "provider-secret",
    name: "TS_OAUTH_CLIENT_ID",
    required: true,
    targets: ["github-staging", "github-production"],
  },
  {
    description: "API origin used by the web app",
    kind: "config",
    name: "VITE_SERVER_URL",
    required: true,
    targets: ["local-web"],
  },
  {
    description: "Jobs processed concurrently per queue",
    kind: "config",
    name: "WORKERS_CONCURRENCY",
    required: false,
    targets: ["local-workers", "dokploy-workers"],
  },
  {
    description: "Worker polling interval",
    kind: "config",
    name: "WORKERS_POLLING_INTERVAL_SECONDS",
    required: false,
    targets: ["local-workers", "dokploy-workers"],
  },
  {
    description: "Worker health and metrics HTTP port",
    kind: "config",
    name: "WORKERS_PORT",
    required: false,
    targets: ["local-workers", "dokploy-workers"],
  },
] as const satisfies readonly ConfigEntry[];

export const manifestNames = new Set(configManifest.map(({ name }) => name));
