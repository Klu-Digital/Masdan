import { execFileSync } from "node:child_process";

export interface GitHubSnapshot {
  repositorySecrets: Set<string>;
  repositoryVariables: Map<string, string>;
  environmentSecrets: Set<string>;
  environmentVariables: Map<string, string>;
}

// Secret material reaches `gh` through stdin, never argv — a process listing is
// world-readable on a shared machine. The catch is bare on purpose: execFileSync
// attaches stdout and stderr to the thrown error, and for `secret set` that
// output can echo the value we just piped in.
const runGh = (args: string[], input?: string): string => {
  try {
    return execFileSync("gh", args, {
      encoding: "utf-8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "GitHub CLI command failed. Check `gh auth status` and repository access."
    );
  }
};

const parseList = (output: string): Record<string, string>[] => {
  try {
    const parsed: unknown = JSON.parse(output);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, string> =>
            typeof item === "object" && item !== null
        )
      : [];
  } catch {
    throw new Error("GitHub CLI returned an invalid response.");
  }
};

const scopeArgs = (environment?: string): string[] =>
  environment ? ["--env", environment] : [];

export interface GitHubAvailability {
  available: boolean;
  reason?: string;
  repository?: string;
}

/**
 * Probes `gh` without throwing. An unauthenticated CLI degrades the wizard to a
 * manual checklist rather than aborting a run that may already have written.
 */
export const probeGitHub = (): GitHubAvailability => {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
  } catch {
    return {
      available: false,
      reason:
        "GitHub CLI is unavailable or unauthenticated. Install `gh` and run `gh auth login`.",
    };
  }
  try {
    const output = execFileSync(
      "gh",
      ["repo", "view", "--json", "nameWithOwner"],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }
    );
    const parsed: unknown = JSON.parse(output);
    const repository =
      typeof parsed === "object" &&
      parsed !== null &&
      "nameWithOwner" in parsed &&
      typeof parsed.nameWithOwner === "string"
        ? parsed.nameWithOwner
        : undefined;
    return { available: true, repository };
  } catch {
    return {
      available: false,
      reason:
        "The GitHub CLI cannot see this repository. Check the `origin` remote and your access.",
    };
  }
};

/** A missing environment is an answer, not a failure — it is what a first run
 * looks like. */
const environmentExists = (environment: string): boolean => {
  try {
    execFileSync(
      "gh",
      ["api", `repos/{owner}/{repo}/environments/${environment}`],
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
};

export const createGitHubClient = () => {
  const ensureAccess = (): void => {
    runGh(["auth", "status"]);
    runGh(["repo", "view", "--json", "nameWithOwner"]);
  };

  const ensureEnvironment = (environment: string): void => {
    runGh([
      "api",
      "--method",
      "PUT",
      `repos/{owner}/{repo}/environments/${environment}`,
    ]);
  };

  const listSecrets = (environment?: string): Set<string> => {
    const rows = parseList(
      runGh(["secret", "list", "--json", "name", ...scopeArgs(environment)])
    );
    return new Set(
      rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string")
    );
  };

  const listVariables = (environment?: string): Map<string, string> => {
    const rows = parseList(
      runGh([
        "variable",
        "list",
        "--json",
        "name,value",
        ...scopeArgs(environment),
      ])
    );
    return new Map(
      rows
        .filter(
          (row): row is { name: string; value: string } =>
            typeof row.name === "string" && typeof row.value === "string"
        )
        .map(({ name, value }) => [name, value])
    );
  };

  const snapshot = (environment: string): GitHubSnapshot => ({
    environmentSecrets: listSecrets(environment),
    environmentVariables: listVariables(environment),
    repositorySecrets: listSecrets(),
    repositoryVariables: listVariables(),
  });

  const setSecret = (
    name: string,
    value: string,
    environment?: string
  ): void => {
    runGh(["secret", "set", name, ...scopeArgs(environment)], `${value}\n`);
  };

  const setVariable = (
    name: string,
    value: string,
    environment?: string
  ): void => {
    runGh([
      "variable",
      "set",
      name,
      "--body",
      value,
      ...scopeArgs(environment),
    ]);
  };

  return {
    ensureAccess,
    ensureEnvironment,
    environmentExists,
    setSecret,
    setVariable,
    snapshot,
  };
};

export type GitHubClient = ReturnType<typeof createGitHubClient>;

export interface DokployApplicationState {
  envText: string;
  names: Set<string>;
}

const envNames = (envText: string): Set<string> => {
  const names = new Set<string>();
  for (const line of envText.split("\n")) {
    const match = line.match(/^\s*(?<name>[A-Z][A-Z0-9_]*)\s*=/u);
    if (match?.groups?.name) {
      names.add(match.groups.name);
    }
  }
  return names;
};

const responseJson = async (response: Response): Promise<unknown> => {
  if (!response.ok) {
    throw new Error(
      `Dokploy request failed (${response.status}). Check the URL and token.`
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Dokploy returned an invalid response.");
  }
};

export interface DiscoveredApplication {
  applicationId: string;
  label: string;
}

/**
 * Dokploy has moved these field names between versions, so every property is
 * read defensively — discovery failing back to a manual id prompt is fine,
 * a crash mid-wizard is not.
 */
const readApplications = (payload: unknown): DiscoveredApplication[] => {
  if (!Array.isArray(payload)) {
    return [];
  }
  const found: DiscoveredApplication[] = [];
  for (const project of payload) {
    if (typeof project !== "object" || project === null) {
      continue;
    }
    const projectName =
      "name" in project && typeof project.name === "string" ? project.name : "";
    const applications =
      "applications" in project && Array.isArray(project.applications)
        ? project.applications
        : [];
    for (const application of applications) {
      if (typeof application !== "object" || application === null) {
        continue;
      }
      const id =
        "applicationId" in application &&
        typeof application.applicationId === "string"
          ? application.applicationId
          : undefined;
      if (!id) {
        continue;
      }
      const name =
        "name" in application && typeof application.name === "string"
          ? application.name
          : id;
      found.push({
        applicationId: id,
        label: projectName ? `${projectName} / ${name}` : name,
      });
    }
  }
  return found;
};

export const createDokployClient = (url: string, token: string) => {
  const baseUrl = url.replace(/\/$/u, "");
  const request = async (
    path: string,
    init?: RequestInit
  ): Promise<unknown> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": token,
        ...init?.headers,
      },
    });
    return responseJson(response);
  };

  const getApplication = async (
    applicationId: string
  ): Promise<DokployApplicationState> => {
    const response = await request(
      `/api/application.one?applicationId=${encodeURIComponent(applicationId)}`
    );
    const envText =
      typeof response === "object" && response !== null && "env" in response
        ? response.env
        : "";
    if (typeof envText !== "string") {
      throw new TypeError(
        "Dokploy application response did not include an environment."
      );
    }
    return { envText, names: envNames(envText) };
  };

  const saveApplicationEnvironment = async (
    applicationId: string,
    envText: string
  ): Promise<void> => {
    await request("/api/application.saveEnvironment", {
      body: JSON.stringify({
        applicationId,
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
        env: envText,
      }),
      method: "POST",
    });
  };

  const listApplications = async (): Promise<DiscoveredApplication[]> => {
    try {
      return readApplications(await request("/api/project.all"));
    } catch {
      return [];
    }
  };

  return { getApplication, listApplications, saveApplicationEnvironment };
};

export type DokployClient = ReturnType<typeof createDokployClient>;
