import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { generateSecret } from "./generate";
import { configManifest } from "./manifest";
import type { DeploymentEnvironment, PlannedWrite, RemoteState } from "./plan";
import {
  deriveUrls,
  emptyRemoteState,
  formatDerivedUrls,
  formatPlan,
  planWrites,
} from "./plan";
import { createDokployClient, createGitHubClient, probeGitHub } from "./remote";
import type {
  DiscoveredApplication,
  DokployApplicationState,
  GitHubSnapshot,
} from "./remote";

const PROVIDER_URLS = {
  posthog: "https://app.posthog.com/settings/project",
  tailscale: "https://login.tailscale.com/admin/settings/oauth",
} as const;

const ETX = "\u0003";
const DELETE = "\u007F";
const BACKSPACE = "\b";

export class SetupCancelledError extends Error {
  constructor() {
    super("Setup cancelled.");
    this.name = "SetupCancelledError";
  }
}

/** Detaches a masked-input handler and restores the cooked terminal. */
const detach = (handler: (chunk: Buffer | string) => void): void => {
  input.setRawMode?.(false);
  input.off("data", handler);
};

const askHidden = async (question: string): Promise<string> => {
  if (!(input.isTTY && input.setRawMode)) {
    const prompts = createInterface({ input, output });
    try {
      const answer = await prompts.question(question);
      return answer.trim();
    } finally {
      prompts.close();
    }
  }
  output.write(question);
  // A raw keypress stream has no promise form: the value is only complete once
  // Enter arrives, so the resolver has to outlive this call. The handler is a
  // const arrow that detaches itself by name once Enter or Ctrl+C arrives.
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === ETX) {
          detach(onData);
          reject(new SetupCancelledError());
          return;
        }
        if (character === "\r" || character === "\n") {
          detach(onData);
          output.write("\n");
          resolve(value);
          return;
        }
        value =
          character === DELETE || character === BACKSPACE
            ? value.slice(0, -1)
            : value + character;
      }
    };
    input.setRawMode(true);
    input.on("data", onData);
  });
};

const ask = async (question: string, hidden = false): Promise<string> => {
  if (hidden) {
    return askHidden(question);
  }
  const prompts = createInterface({ input, output });
  try {
    const answer = await prompts.question(question);
    return answer.trim();
  } finally {
    prompts.close();
  }
};

const confirm = async (
  question: string,
  defaultYes = false
): Promise<boolean> => {
  const raw = await ask(`${question}${defaultYes ? " (Y/n) " : " (y/N) "}`);
  const answer = raw.toLowerCase();
  return answer ? answer === "y" || answer === "yes" : defaultYes;
};

const requiredValue = async (
  label: string,
  options: { secret?: boolean; startsWith?: string } = {}
): Promise<string> => {
  while (true) {
    const value = await ask(
      `${label}${options.secret ? " (not stored locally)" : ""}: `,
      options.secret
    );
    if (!value) {
      console.log("A value is required.");
      continue;
    }
    if (options.startsWith && !value.startsWith(options.startsWith)) {
      console.log(`The value must start with ${options.startsWith}.`);
      continue;
    }
    return value;
  }
};

const optionalValue = async (label: string): Promise<string | undefined> =>
  (await ask(`${label} (press Enter to skip): `)) || undefined;

/**
 * Collected values live here and nowhere else — never on disk. The wizard holds
 * them only between the prompt that produced them and the write that consumes
 * them, then clears the map.
 */
interface Collection {
  order: string[];
  values: Map<string, string>;
}

const collect = (collection: Collection, name: string, value: string): void => {
  if (!collection.values.has(name)) {
    collection.order.push(name);
  }
  collection.values.set(name, value);
};

interface Application {
  id: string;
  name: "server" | "workers";
  state: DokployApplicationState;
}

const remoteStateFrom = (
  snapshot: GitHubSnapshot,
  applications: readonly Application[]
): RemoteState => {
  const state = emptyRemoteState();
  state.githubSecrets = snapshot.environmentSecrets;
  state.githubVariables = new Set(snapshot.environmentVariables.keys());
  state.githubRepositorySecrets = snapshot.repositorySecrets;
  state.githubRepositoryVariables = new Set(
    snapshot.repositoryVariables.keys()
  );
  for (const application of applications) {
    if (application.name === "server") {
      state.dokployServer = application.state.names;
    } else {
      state.dokployWorkers = application.state.names;
    }
  }
  return state;
};

const needs = (
  state: RemoteState,
  name: string,
  environment: DeploymentEnvironment
): boolean => planWrites([name], environment, state).length > 0;

const appendEnv = (envText: string, name: string, value: string): string => {
  const trimmed = envText.trimEnd();
  return `${trimmed}${trimmed ? "\n" : ""}${name}=${value}\n`;
};

// --- Sections ---------------------------------------------------------------

const collectTailscale = async (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment,
  repository: string
): Promise<void> => {
  console.log("\n1/5 — Tailscale");
  const clientId = needs(state, "TS_OAUTH_CLIENT_ID", environment);
  const audience = needs(state, "TS_AUDIENCE", environment);
  if (!(clientId || audience)) {
    console.log("✓ already configured");
    return;
  }
  console.log(
    [
      "",
      "GitHub Actions reaches the private database over Tailscale, so it needs a",
      "workload identity rather than a reusable OAuth secret.",
      "",
      `  Create it at: ${PROVIDER_URLS.tailscale}`,
      `  Repository:   ${repository}`,
      "  Tag:          tag:ci",
      "",
    ].join("\n")
  );
  if (clientId) {
    collect(
      collection,
      "TS_OAUTH_CLIENT_ID",
      await requiredValue("Client ID", { secret: true })
    );
  }
  if (audience) {
    collect(
      collection,
      "TS_AUDIENCE",
      await requiredValue("Audience", { secret: true })
    );
  }
};

const collectPostHog = async (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment
): Promise<void> => {
  console.log("\n2/5 — PostHog");
  const outstanding = [
    "POSTHOG_PROJECT_ID",
    "POSTHOG_HOST",
    "POSTHOG_PERSONAL_API_KEY",
    "POSTHOG_PROJECT_API_KEY",
  ].filter((name) => needs(state, name, environment));
  if (outstanding.length === 0) {
    console.log("✓ already configured");
    return;
  }
  if (
    !(await confirm(
      `Configure optional analytics? Settings live at ${PROVIDER_URLS.posthog}`
    ))
  ) {
    console.log("– skipped");
    return;
  }

  if (needs(state, "POSTHOG_PROJECT_API_KEY", environment)) {
    console.log("\nThe project key is what the running app sends events with.");
    collect(
      collection,
      "POSTHOG_PROJECT_API_KEY",
      await requiredValue("Project API key (phc_...)", {
        secret: true,
        startsWith: "phc_",
      })
    );
  }
  if (needs(state, "POSTHOG_PROJECT_ID", environment)) {
    collect(
      collection,
      "POSTHOG_PROJECT_ID",
      await requiredValue("Project ID")
    );
  }
  if (needs(state, "POSTHOG_HOST", environment)) {
    const host = await optionalValue("PostHog host [https://eu.i.posthog.com]");
    collect(collection, "POSTHOG_HOST", host ?? "https://eu.i.posthog.com");
  }
  if (!needs(state, "POSTHOG_PERSONAL_API_KEY", environment)) {
    return;
  }
  console.log(
    [
      "",
      "CI uploads source maps with a separate Personal API Key. This is NOT the",
      "phc_ project key, and it never reaches the application runtime.",
      "",
    ].join("\n")
  );
  if (await confirm("Configure the CI source-map key now?")) {
    collect(
      collection,
      "POSTHOG_PERSONAL_API_KEY",
      await requiredValue("Personal API key", {
        secret: true,
        startsWith: "phx_",
      })
    );
  }
};

const chooseApplication = async (
  label: string,
  discovered: readonly DiscoveredApplication[]
): Promise<string> => {
  if (discovered.length === 0) {
    return await requiredValue(`${label} application ID`);
  }
  console.log(`\nSelect the ${label} application:`);
  for (const [index, application] of discovered.entries()) {
    console.log(`  ${index + 1}) ${application.label}`);
  }
  console.log(`  ${discovered.length + 1}) Enter an ID manually`);
  while (true) {
    const answer = await ask("Choose: ");
    const choice = Math.trunc(Number(answer));
    if (choice >= 1 && choice <= discovered.length) {
      return discovered[choice - 1]?.applicationId ?? "";
    }
    if (choice === discovered.length + 1) {
      return await requiredValue(`${label} application ID`);
    }
    console.log("Pick one of the numbers listed.");
  }
};

interface DokploySetup {
  applications: Application[];
  client: ReturnType<typeof createDokployClient>;
}

const setUpDokploy = async (
  collection: Collection,
  snapshot: GitHubSnapshot
): Promise<DokploySetup> => {
  console.log("\n3/5 — Dokploy");
  const existing = snapshot.environmentVariables;
  const url =
    existing.get("DOKPLOY_URL") ?? (await requiredValue("Dokploy URL"));
  if (!existing.has("DOKPLOY_URL")) {
    collect(collection, "DOKPLOY_URL", url);
  }

  // Needed now to reach the API, and stored as a GitHub secret because
  // deploy.yml calls Dokploy too. It is never written to disk.
  const token =
    process.env.DOKPLOY_TOKEN ||
    (await requiredValue("Dokploy API token", { secret: true }));
  if (!snapshot.environmentSecrets.has("DOKPLOY_TOKEN")) {
    collect(collection, "DOKPLOY_TOKEN", token);
  }

  const client = createDokployClient(url, token);
  const discovered = await client.listApplications();
  if (discovered.length === 0) {
    console.log(
      "Could not list applications; enter the IDs from the Dokploy UI."
    );
  }

  const ids = new Map<string, string>();
  for (const [variable, label] of [
    ["DOKPLOY_SERVER_APPLICATION_ID", "server"],
    ["DOKPLOY_WORKERS_APPLICATION_ID", "workers"],
    ["DOKPLOY_WEB_APPLICATION_ID", "web"],
  ] as const) {
    const configured = existing.get(variable);
    if (configured) {
      console.log(`✓ ${variable} already configured`);
      ids.set(variable, configured);
      continue;
    }
    const id = await chooseApplication(label, discovered);
    ids.set(variable, id);
    collect(collection, variable, id);
  }

  const applications: Application[] = [];
  for (const [name, variable] of [
    ["server", "DOKPLOY_SERVER_APPLICATION_ID"],
    ["workers", "DOKPLOY_WORKERS_APPLICATION_ID"],
  ] as const) {
    const id = ids.get(variable);
    if (!id) {
      throw new Error(`Missing ${variable}.`);
    }
    applications.push({ id, name, state: await client.getApplication(id) });
  }
  return { applications, client };
};

const collectStorage = async (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment
): Promise<void> => {
  const outstanding = [
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].some((name) => needs(state, name, environment));
  if (!(outstanding && (await confirm("Configure optional object storage?")))) {
    return;
  }

  console.log("\n  1) Cloudflare R2\n  2) AWS S3\n  3) Other S3-compatible");
  const provider = (await ask("Provider [1]: ")) || "1";
  collect(collection, "S3_BUCKET", await requiredValue("Bucket name"));
  collect(
    collection,
    "S3_ACCESS_KEY_ID",
    await requiredValue("Access key ID", { secret: true })
  );
  collect(
    collection,
    "S3_SECRET_ACCESS_KEY",
    await requiredValue("Secret access key", { secret: true })
  );

  // R2 only accepts "auto", and real S3 derives its endpoint from the region —
  // so AWS is the one provider that should not be asked for an endpoint.
  if (provider === "2") {
    collect(collection, "S3_REGION", await requiredValue("Region"));
    return;
  }
  collect(
    collection,
    "S3_REGION",
    provider === "3" ? await requiredValue("Region") : "auto"
  );
  const endpoint = await requiredValue("S3 endpoint");
  collect(collection, "S3_ENDPOINT", endpoint);
  const publicEndpoint = await optionalValue(
    "Public endpoint, if the browser reaches the bucket at a different host"
  );
  collect(collection, "S3_PUBLIC_ENDPOINT", publicEndpoint ?? endpoint);
  if (provider === "3" && (await confirm("Use path-style URLs?"))) {
    collect(collection, "S3_FORCE_PATH_STYLE", "true");
  }
};

const collectInfrastructure = async (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment
): Promise<void> => {
  console.log("\n4/5 — Infrastructure");

  if (needs(state, "DATABASE_URL", environment)) {
    collect(
      collection,
      "DATABASE_URL",
      await requiredValue("Database URL", { secret: true })
    );
  } else {
    console.log("✓ DATABASE_URL already configured");
  }

  if (
    needs(state, "REDIS_URL", environment) &&
    (await confirm("Configure optional Redis?"))
  ) {
    collect(
      collection,
      "REDIS_URL",
      await requiredValue("Redis URL", { secret: true })
    );
  }

  await collectStorage(collection, state, environment);
};

const collectUrls = async (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment
): Promise<void> => {
  console.log("\n5/5 — Application URLs");
  const outstanding = ["BETTER_AUTH_URL", "CORS_ORIGIN", "SMOKE_URL"].filter(
    (name) => needs(state, name, environment)
  );
  if (outstanding.length === 0) {
    console.log("✓ already configured");
    return;
  }

  const webUrl = await requiredValue("Public application URL");
  // The deployed topology puts the SPA and the API on one origin — nginx in the
  // web image proxies /api/auth and /rpc — so one answer usually covers both.
  const apiUrl = (await confirm("Is the API served on a different hostname?"))
    ? await requiredValue("Public API URL")
    : undefined;

  const derived = deriveUrls(webUrl, apiUrl);
  console.log(formatDerivedUrls(derived));
  if (!(await confirm("Use these?", true))) {
    throw new SetupCancelledError();
  }
  for (const name of outstanding) {
    collect(collection, name, derived[name as keyof typeof derived]);
  }
};

const generateMissing = (
  collection: Collection,
  state: RemoteState,
  environment: DeploymentEnvironment
): void => {
  for (const entry of configManifest) {
    if (
      entry.kind !== "generated-secret" ||
      !needs(state, entry.name, environment)
    ) {
      continue;
    }
    // Generated once and written to every destination in this same run, so a
    // rerun sees the name present and never rotates it.
    collect(collection, entry.name, generateSecret());
    console.log(`✓ Generated ${entry.name}`);
  }
};

// --- Apply ------------------------------------------------------------------

export const applyGitHub = (
  writes: readonly PlannedWrite[],
  collection: Collection,
  github: ReturnType<typeof createGitHubClient>,
  environment: DeploymentEnvironment
): void => {
  for (const write of writes) {
    const value = collection.values.get(write.name);
    if (
      value === undefined ||
      (write.target !== "github-secret" && write.target !== "github-variable")
    ) {
      continue;
    }
    const scope = write.scope === "repository" ? undefined : environment;
    if (write.secret) {
      github.setSecret(write.name, value, scope);
    } else {
      github.setVariable(write.name, value, scope);
    }
    console.log(`✓ GitHub ${write.scope}: ${write.name}`);
  }
};

export const applyDokploy = async (
  writes: readonly PlannedWrite[],
  collection: Collection,
  dokploy: ReturnType<typeof createDokployClient>,
  applications: readonly Application[]
): Promise<void> => {
  // One save per application rather than one per variable: fewer requests, and
  // a failure leaves that application's environment untouched rather than half
  // written.
  for (const application of applications) {
    const target = `dokploy-${application.name}`;
    const applicable = writes.filter(
      (write) => write.target === target && collection.values.has(write.name)
    );
    if (applicable.length === 0) {
      continue;
    }
    let { envText } = application.state;
    for (const write of applicable) {
      envText = appendEnv(
        envText,
        write.name,
        collection.values.get(write.name) ?? ""
      );
    }
    await dokploy.saveApplicationEnvironment(application.id, envText);
    application.state.envText = envText;
    for (const write of applicable) {
      application.state.names.add(write.name);
    }
    console.log(
      `✓ Dokploy ${application.name}: ${applicable.length} variable(s)`
    );
  }
};

const verifyWrites = async (
  writes: readonly PlannedWrite[],
  github: ReturnType<typeof createGitHubClient>,
  dokploy: ReturnType<typeof createDokployClient>,
  applications: readonly Application[],
  environment: DeploymentEnvironment
): Promise<string[]> => {
  const snapshot = github.snapshot(environment);
  const refreshed: Application[] = [];
  for (const application of applications) {
    refreshed.push({
      ...application,
      state: await dokploy.getApplication(application.id),
    });
  }
  const state = remoteStateFrom(snapshot, refreshed);
  return planWrites(
    [...new Set(writes.map((write) => write.name))],
    environment,
    state
  ).map((write) => `${write.name} -> ${write.target} (${write.scope})`);
};

// --- Entry points -----------------------------------------------------------

export const chooseDeployment =
  async (): Promise<DeploymentEnvironment | null> => {
    const choice = await ask(
      "\nConfigure deployment now?\n  1) Staging\n  2) Production\n  3) Not now\nChoose [3]: "
    );
    if (choice === "1" || choice.toLowerCase() === "staging") {
      return "staging";
    }
    if (choice === "2" || choice.toLowerCase() === "production") {
      return "production";
    }
    return null;
  };

export const chooseProduction = (): Promise<boolean> =>
  confirm("\nConfigure production now?");

export const runDeploymentWizard = async (
  environment: DeploymentEnvironment
): Promise<boolean> => {
  console.log(`\nk22i ${environment} setup\n`);

  const availability = probeGitHub();
  if (!availability.available) {
    console.log(
      [
        `? ${availability.reason}`,
        "",
        "Nothing can be configured automatically without it. Install the GitHub",
        "CLI, run `gh auth login`, then run this command again.",
        "",
      ].join("\n")
    );
    return false;
  }
  console.log("✓ GitHub authenticated");

  const github = createGitHubClient();
  github.ensureEnvironment(environment);
  const snapshot = github.snapshot(environment);

  const collection: Collection = { order: [], values: new Map() };
  const repository = availability.repository ?? "this repository";

  try {
    // Dokploy sits in the middle because its application ids are what make the
    // runtime destinations knowable: every later "is this already set?" question
    // depends on having read those two applications.
    const githubOnly = remoteStateFrom(snapshot, []);
    await collectTailscale(collection, githubOnly, environment, repository);
    await collectPostHog(collection, githubOnly, environment);
    const { applications, client } = await setUpDokploy(collection, snapshot);
    const state = remoteStateFrom(snapshot, applications);
    await collectInfrastructure(collection, state, environment);
    await collectUrls(collection, state, environment);
    generateMissing(collection, state, environment);

    const writes = planWrites(collection.order, environment, state);
    console.log(formatPlan(environment, writes));
    if (writes.length === 0) {
      return true;
    }
    if (!(await confirm("Apply configuration?", true))) {
      throw new SetupCancelledError();
    }

    try {
      applyGitHub(writes, collection, github, environment);
      await applyDokploy(writes, collection, client, applications);
    } catch (error) {
      console.log(
        "\nA remote write failed. Configuration already applied has been preserved."
      );
      console.log("Run the same command again to continue.\n");
      throw error;
    }

    const outstanding = await verifyWrites(
      writes,
      github,
      client,
      applications,
      environment
    );
    if (outstanding.length > 0) {
      console.log("\n? Verification could not confirm:");
      for (const line of outstanding) {
        console.log(`  ${line}`);
      }
      return false;
    }
    console.log("\n✓ Verification passed");
    console.log(`\n${environment} is ready.\n`);
    return true;
  } finally {
    collection.values.clear();
    collection.order.length = 0;
  }
};
