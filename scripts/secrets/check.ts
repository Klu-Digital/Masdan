#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { configManifest } from "./manifest";
import type { DeploymentEnvironment, RemoteState } from "./plan";
import { destinationsFor, emptyRemoteState } from "./plan";
import { createDokployClient, createGitHubClient, probeGitHub } from "./remote";
import { LOCAL_FILES, readValues, repoRootFrom } from "./setup";

export type CheckEnvironment = "local" | DeploymentEnvironment;

export type CheckStatus =
  | "missing"
  | "ok"
  | "invalid"
  | "optional"
  | "unverified";

export interface CheckItem {
  detail: string;
  group?: string;
  name: string;
  status: CheckStatus;
}

export interface CheckResult {
  items: CheckItem[];
  ready: boolean;
  unverified: boolean;
}

const isUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol !== "";
  } catch {
    return false;
  }
};

const isValid = (name: string, value: string): boolean => {
  if (name === "BETTER_AUTH_SECRET") {
    return value.length >= 32;
  }
  if (name === "POSTHOG_PROJECT_API_KEY") {
    return value.startsWith("phc_");
  }
  if (
    [
      "BETTER_AUTH_URL",
      "CORS_ORIGIN",
      "DOKPLOY_URL",
      "POSTHOG_HOST",
      "S3_ENDPOINT",
      "S3_PUBLIC_ENDPOINT",
      "REDIS_URL",
    ].includes(name)
  ) {
    return isUrl(value);
  }
  if (name === "VITE_SERVER_URL") {
    return value === "/" || isUrl(value);
  }
  if (name === "PROMETHEUS_METRICS_PATH") {
    return value.startsWith("/");
  }
  return true;
};

const readLocalFiles = (root: string): Map<string, Map<string, string>> => {
  const values = new Map<string, Map<string, string>>();
  for (const relativePath of Object.values(LOCAL_FILES)) {
    const filePath = path.join(root, relativePath);
    if (existsSync(filePath)) {
      values.set(filePath, readValues(readFileSync(filePath, "utf-8")));
    }
  }
  return values;
};

const summarize = (items: CheckItem[]): CheckResult => ({
  items,
  ready: items.every(
    (item) => item.status !== "missing" && item.status !== "invalid"
  ),
  unverified: items.some((item) => item.status === "unverified"),
});

export const checkLocalEnvironment = (root: string): CheckResult => {
  const files = readLocalFiles(root);
  const items: CheckItem[] = [];
  const seen = new Set<string>();

  for (const entry of configManifest) {
    const targets = entry.targets.filter(
      (candidate) => candidate in LOCAL_FILES
    );
    if (targets.length === 0 || seen.has(entry.name)) {
      continue;
    }
    seen.add(entry.name);
    const values = targets.map((target) => {
      const filePath = path.join(
        root,
        LOCAL_FILES[target as keyof typeof LOCAL_FILES]
      );
      return files.get(filePath)?.get(entry.name);
    });
    const presentValues = values.filter((value): value is string =>
      Boolean(value)
    );
    const missingRequired = entry.required && values.some((value) => !value);
    const invalid = presentValues.some((value) => !isValid(entry.name, value));
    let detail = "optional";
    let status: CheckStatus = "optional";
    if (missingRequired) {
      detail = "required";
      status = "missing";
    } else if (invalid) {
      detail = "invalid configuration";
      status = "invalid";
    } else if (presentValues.length > 0) {
      detail = "";
      status = "ok";
    }
    items.push({ detail, group: "Local", name: entry.name, status });
  }

  return summarize(items);
};

/** What each provider could be asked. A provider we could not reach reports
 * `available: false`, which becomes "unverified" rather than "missing". */
export interface RemoteInspection {
  dokploy: { available: boolean; reason?: string };
  github: {
    available: boolean;
    environmentExists: boolean;
    reason?: string;
  };
  state: RemoteState;
}

const GROUPS = {
  "dokploy-server": "Dokploy server",
  "dokploy-workers": "Dokploy workers",
  "github-secret": "GitHub",
  "github-variable": "GitHub",
} as const;

export const evaluateRemote = (
  environment: DeploymentEnvironment,
  inspection: RemoteInspection
): CheckResult => {
  const items: CheckItem[] = [];

  for (const entry of configManifest) {
    for (const write of destinationsFor(entry.name, environment)) {
      const dokploy =
        write.target === "dokploy-server" || write.target === "dokploy-workers";
      const reachable = dokploy
        ? inspection.dokploy.available
        : inspection.github.available && inspection.github.environmentExists;

      let present = false;
      if (write.target === "dokploy-server") {
        present = inspection.state.dokployServer.has(entry.name);
      } else if (write.target === "dokploy-workers") {
        present = inspection.state.dokployWorkers.has(entry.name);
      } else if (write.scope === "repository") {
        present = write.secret
          ? inspection.state.githubRepositorySecrets.has(entry.name)
          : inspection.state.githubRepositoryVariables.has(entry.name);
      } else {
        present = write.secret
          ? inspection.state.githubSecrets.has(entry.name)
          : inspection.state.githubVariables.has(entry.name);
      }

      let status: CheckStatus = "optional";
      let detail = "optional";
      if (present) {
        status = "ok";
        detail = "";
      } else if (!reachable) {
        status = "unverified";
        detail = dokploy
          ? (inspection.dokploy.reason ?? "Dokploy was not reachable")
          : (inspection.github.reason ?? "GitHub was not reachable");
      } else if (entry.required) {
        status = "missing";
        detail = "required";
      }

      const scope =
        write.target === "github-secret" || write.target === "github-variable"
          ? ` ${write.scope}`
          : "";
      items.push({
        detail,
        group: `${GROUPS[write.target]}${scope}`,
        name: entry.name,
        status,
      });
    }
  }

  return summarize(items);
};

// Reads names only; secret values are never fetched.
export const inspectRemote = async (
  environment: DeploymentEnvironment
): Promise<RemoteInspection> => {
  const state = emptyRemoteState();
  const availability = probeGitHub();
  const inspection: RemoteInspection = {
    dokploy: { available: false, reason: "Dokploy was not inspected" },
    github: {
      available: availability.available,
      environmentExists: false,
      reason: availability.reason,
    },
    state,
  };

  if (!availability.available) {
    inspection.dokploy.reason =
      "Dokploy needs GitHub configuration to locate the applications";
    return inspection;
  }

  const github = createGitHubClient();
  if (!github.environmentExists(environment)) {
    inspection.github.reason = `The GitHub environment "${environment}" does not exist yet.`;
    inspection.dokploy.reason = inspection.github.reason;
    return inspection;
  }
  inspection.github.environmentExists = true;

  const snapshot = github.snapshot(environment);
  state.githubSecrets = snapshot.environmentSecrets;
  state.githubVariables = new Set(snapshot.environmentVariables.keys());
  state.githubRepositorySecrets = snapshot.repositorySecrets;
  state.githubRepositoryVariables = new Set(
    snapshot.repositoryVariables.keys()
  );

  const dokployUrl = snapshot.environmentVariables.get("DOKPLOY_URL");
  const token = process.env.DOKPLOY_TOKEN;
  if (!(dokployUrl && token)) {
    inspection.dokploy.reason = token
      ? "DOKPLOY_URL is not configured for this environment"
      : "set DOKPLOY_TOKEN in the environment to verify Dokploy";
    return inspection;
  }

  const dokploy = createDokployClient(dokployUrl, token);
  const applications = [
    ["DOKPLOY_SERVER_APPLICATION_ID", "dokployServer"],
    ["DOKPLOY_WORKERS_APPLICATION_ID", "dokployWorkers"],
  ] as const;
  try {
    for (const [variable, field] of applications) {
      const id = snapshot.environmentVariables.get(variable);
      if (!id) {
        inspection.dokploy.reason = `${variable} is not configured for this environment`;
        return inspection;
      }
      const application = await dokploy.getApplication(id);
      state[field] = application.names;
    }
    inspection.dokploy = { available: true };
  } catch {
    inspection.dokploy = {
      available: false,
      reason: "Dokploy did not answer; check the URL and token",
    };
  }
  return inspection;
};

const MARKERS: Record<CheckStatus, string> = {
  invalid: "✗",
  missing: "○",
  ok: "✓",
  optional: "–",
  unverified: "?",
};

export const formatCheckResult = (
  environment: CheckEnvironment,
  result: CheckResult
): string => {
  const lines = [
    environment === "local" ? "Local" : `masdan ${environment}`,
    "",
  ];

  // Items arrive ordered by manifest entry, so each one may belong to a
  // different destination. Bucket them first or every header repeats.
  const groups = new Map<string, CheckItem[]>();
  for (const item of result.items) {
    const key = environment === "local" ? "" : (item.group ?? "");
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  for (const [group, items] of groups) {
    // One provider yields one reason, so an unreachable destination says why
    // once in its header rather than on all thirty of its lines.
    const reason = items.find((item) => item.status === "unverified")?.detail;
    if (group) {
      lines.push(reason ? `${group} — ${reason}` : group);
    }
    for (const item of items) {
      const detail =
        item.detail && item.status !== "unverified" ? ` (${item.detail})` : "";
      lines.push(`${MARKERS[item.status]} ${item.name}${detail}`);
    }
    lines.push("");
  }
  lines.pop();

  let verdict = "missing required configuration";
  if (result.ready) {
    verdict = result.unverified
      ? "nothing missing, but some destinations could not be verified"
      : "ready";
  }
  lines.push("", `Result: ${verdict}`, "");
  return lines.join("\n");
};

const parseEnvironment = (argv: string[]): CheckEnvironment | null => {
  const environmentIndex = argv.indexOf("--environment");
  const value =
    environmentIndex === -1
      ? argv
          .find((argument) => argument.startsWith("--environment="))
          ?.slice(14)
      : argv[environmentIndex + 1];
  if (!value) {
    return "local";
  }
  if (!["local", "staging", "production"].includes(value)) {
    return null;
  }
  return value as CheckEnvironment;
};

export const main = async (): Promise<void> => {
  const environment = parseEnvironment(process.argv.slice(2));
  if (!environment) {
    process.stderr.write(
      "Usage: pnpm secrets:check [--environment staging|production]\n"
    );
    process.exitCode = 1;
    return;
  }
  const result =
    environment === "local"
      ? checkLocalEnvironment(repoRootFrom(import.meta.dirname))
      : evaluateRemote(environment, await inspectRemote(environment));
  process.stdout.write(formatCheckResult(environment, result));
  // Three outcomes, three codes: a gate that cannot reach a provider must not
  // read as a pass, and must not read as a missing secret either.
  if (!result.ready) {
    process.exitCode = 1;
    return;
  }
  if (result.unverified) {
    process.exitCode = 2;
  }
};

if (import.meta.main) {
  await main();
}
