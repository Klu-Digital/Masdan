import { configManifest } from "./manifest";
import type { ConfigTarget } from "./manifest";

export type DeploymentEnvironment = "staging" | "production";

export type WriteTarget =
  | "github-secret"
  | "github-variable"
  | "dokploy-server"
  | "dokploy-workers";

export interface PlannedWrite {
  name: string;
  scope: string;
  secret: boolean;
  target: WriteTarget;
}

/** Names already present remotely. Secret VALUES are never read back. */
export interface RemoteState {
  dokployServer: Set<string>;
  dokployWorkers: Set<string>;
  githubRepositorySecrets: Set<string>;
  githubRepositoryVariables: Set<string>;
  githubSecrets: Set<string>;
  githubVariables: Set<string>;
}

export const emptyRemoteState = (): RemoteState => ({
  dokployServer: new Set(),
  dokployWorkers: new Set(),
  githubRepositorySecrets: new Set(),
  githubRepositoryVariables: new Set(),
  githubSecrets: new Set(),
  githubVariables: new Set(),
});

const entryFor = (name: string) =>
  configManifest.find((entry) => entry.name === name);

const isSecret = (name: string): boolean => entryFor(name)?.kind !== "config";

export const destinationsFor = (
  name: string,
  environment: DeploymentEnvironment
): PlannedWrite[] => {
  const entry = entryFor(name);
  if (!entry) {
    return [];
  }
  const secret = isSecret(name);
  const writes: PlannedWrite[] = [];
  const targets = entry.targets as readonly ConfigTarget[];

  if (targets.includes("github-repository")) {
    writes.push({
      name,
      scope: "repository",
      secret,
      target: secret ? "github-secret" : "github-variable",
    });
  }
  if (targets.includes(`github-${environment}` as ConfigTarget)) {
    writes.push({
      name,
      scope: environment,
      secret,
      target: secret ? "github-secret" : "github-variable",
    });
  }
  if (targets.includes("dokploy-server")) {
    writes.push({ name, scope: "server", secret, target: "dokploy-server" });
  }
  if (targets.includes("dokploy-workers")) {
    writes.push({ name, scope: "workers", secret, target: "dokploy-workers" });
  }
  return writes;
};

const alreadyPresent = (write: PlannedWrite, remote: RemoteState): boolean => {
  if (write.target === "dokploy-server") {
    return remote.dokployServer.has(write.name);
  }
  if (write.target === "dokploy-workers") {
    return remote.dokployWorkers.has(write.name);
  }
  if (write.scope === "repository") {
    return write.secret
      ? remote.githubRepositorySecrets.has(write.name)
      : remote.githubRepositoryVariables.has(write.name);
  }
  return write.secret
    ? remote.githubSecrets.has(write.name)
    : remote.githubVariables.has(write.name);
};

// Existing names are skipped: a rerun resumes and never rotates a secret.
export const planWrites = (
  names: readonly string[],
  environment: DeploymentEnvironment,
  remote: RemoteState
): PlannedWrite[] =>
  names
    .flatMap((name) => destinationsFor(name, environment))
    .filter((write) => !alreadyPresent(write, remote));

const GROUP_TITLES: Record<WriteTarget, string> = {
  "dokploy-server": "Dokploy server",
  "dokploy-workers": "Dokploy workers",
  "github-secret": "GitHub Secrets",
  "github-variable": "GitHub Variables",
};

const GROUP_ORDER: WriteTarget[] = [
  "github-secret",
  "github-variable",
  "dokploy-server",
  "dokploy-workers",
];

/** Names and destinations only — never a value. */
export const formatPlan = (
  environment: DeploymentEnvironment,
  writes: readonly PlannedWrite[]
): string => {
  if (writes.length === 0) {
    return `\nNothing left to configure for ${environment}.\n`;
  }
  const lines = [`\nReady to configure ${environment}`, ""];
  for (const target of GROUP_ORDER) {
    const group = writes.filter((write) => write.target === target);
    if (group.length === 0) {
      continue;
    }
    lines.push(`${GROUP_TITLES[target]}`);
    for (const write of group) {
      const scope =
        write.target === "github-secret" || write.target === "github-variable"
          ? ` (${write.scope})`
          : "";
      lines.push(`  ${write.name}${scope}`);
    }
    lines.push("");
  }
  lines.push("No secret values will be displayed.", "");
  return lines.join("\n");
};

const trimSlash = (value: string): string => value.replace(/\/+$/u, "");

export interface DerivedUrls {
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: string;
  SMOKE_URL: string;
}

export const deriveUrls = (webUrl: string, apiUrl?: string): DerivedUrls => {
  const web = trimSlash(webUrl);
  const api = apiUrl ? trimSlash(apiUrl) : web;
  return { BETTER_AUTH_URL: api, CORS_ORIGIN: web, SMOKE_URL: api };
};

export const formatDerivedUrls = (derived: DerivedUrls): string =>
  [
    "",
    "Derived configuration:",
    "",
    `  BETTER_AUTH_URL  ${derived.BETTER_AUTH_URL}`,
    `  CORS_ORIGIN      ${derived.CORS_ORIGIN}`,
    `  SMOKE_URL        ${derived.SMOKE_URL}`,
    "",
  ].join("\n");
