#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { generateSecret } from "./generate";
import { configManifest } from "./manifest";
import {
  chooseDeployment,
  chooseProduction,
  runDeploymentWizard,
  SetupCancelledError,
} from "./wizard";

export { generateSecret } from "./generate";

export const LOCAL_FILES = {
  "local-native": "apps/native/.env",
  "local-server": "apps/server/.env",
  "local-web": "apps/web/.env",
  "local-workers": "apps/workers/.env",
} as const;

export const readValues = (content: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const line of content.split("\n")) {
    const match = line.match(
      /^\s*(?:export\s+)?(?<name>[A-Z][A-Z0-9_]*)\s*=\s*(?<value>.*)\s*$/u
    );
    if (!match?.[1]) {
      continue;
    }
    let value = match.groups?.value ?? "";
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match.groups?.name ?? "", value);
  }
  return values;
};

const setValue = (content: string, name: string, value: string): string => {
  const lines = content.split("\n");
  const assignment = new RegExp(
    `^\\s*(?:#\\s*)?(?:export\\s+)?${name}\\s*=`,
    "u"
  );
  const index = lines.findIndex((line) => assignment.test(line));
  if (index === -1) {
    const separator = content.endsWith("\n") ? "" : "\n";
    return `${content}${separator}${name}=${value}\n`;
  }
  lines[index] = `${name}=${value}`;
  return lines.join("\n");
};

export const repoRootFrom = (start: string): string => {
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error("Could not find the repository root");
};

export interface SetupResult {
  createdFiles: string[];
  generated: string[];
  reused: string[];
  missingProviders: string[];
}

const localTargets = new Set(Object.keys(LOCAL_FILES));

export const setupLocalEnvironment = (root: string): SetupResult => {
  const createdFiles: string[] = [];
  const generated: string[] = [];
  const reused: string[] = [];
  const valuesByFile = new Map<string, Map<string, string>>();

  for (const relativePath of Object.values(LOCAL_FILES)) {
    const filePath = path.join(root, relativePath);
    const examplePath = `${filePath}.example`;
    if (!existsSync(filePath)) {
      copyFileSync(examplePath, filePath);
      createdFiles.push(relativePath);
    }
    valuesByFile.set(filePath, readValues(readFileSync(filePath, "utf-8")));
  }

  for (const entry of configManifest) {
    if (entry.kind !== "generated-secret") {
      continue;
    }
    const paths = entry.targets
      .filter((target) => localTargets.has(target))
      .map((target) =>
        path.join(root, LOCAL_FILES[target as keyof typeof LOCAL_FILES])
      );

    // One value per name across every file that wants it. PROMETHEUS_METRICS_TOKEN
    // goes to both the server and the workers, and a scrape config configured
    // against one of two different tokens would 401 on the other.
    const existing = paths
      .map((filePath) => valuesByFile.get(filePath)?.get(entry.name))
      .find(Boolean);
    const value = existing ?? generateSecret();
    if (existing) {
      reused.push(entry.name);
    }

    for (const filePath of paths) {
      const values = valuesByFile.get(filePath);
      if (!values || values.get(entry.name)) {
        continue;
      }
      writeFileSync(
        filePath,
        setValue(readFileSync(filePath, "utf-8"), entry.name, value)
      );
      values.set(entry.name, value);
      if (!existing) {
        generated.push(entry.name);
      }
    }
  }

  const missingProviders = configManifest
    .filter(
      (entry) =>
        entry.kind === "provider-secret" &&
        entry.required &&
        !entry.targets.some((target) => localTargets.has(target))
    )
    .map(({ name }) => name);

  return {
    createdFiles,
    generated: [...new Set(generated)],
    missingProviders,
    reused: [...new Set(reused)],
  };
};

export const formatSetupResult = (result: SetupResult): string => {
  const lines = ["Local configuration", ""];
  for (const relativePath of result.createdFiles) {
    lines.push(`✓ ${relativePath} created`);
  }
  for (const target of Object.keys(LOCAL_FILES)) {
    const relativePath = LOCAL_FILES[target as keyof typeof LOCAL_FILES];
    if (!result.createdFiles.includes(relativePath)) {
      lines.push(`✓ ${relativePath} exists`);
    }
  }
  for (const name of result.generated) {
    lines.push(`✓ ${name} generated`);
  }
  for (const name of result.reused) {
    lines.push(`✓ ${name} preserved`);
  }

  lines.push(
    "",
    "✓ Local development is ready — no external account needed.",
    ""
  );
  if (result.missingProviders.length > 0) {
    lines.push("Deployment only, collected by --environment staging:", "");
    for (const name of result.missingProviders) {
      const entry = configManifest.find((candidate) => candidate.name === name);
      lines.push(`– ${name} — ${entry?.description ?? "human setup required"}`);
    }
  }
  return `${lines.join("\n")}\n`;
};

const parseEnvironment = (
  argv: string[]
): "local" | "staging" | "production" | null => {
  const index = argv.indexOf("--environment");
  const value =
    index === -1
      ? argv
          .find((argument) => argument.startsWith("--environment="))
          ?.slice(14)
      : argv[index + 1];
  if (!value) {
    return "local";
  }
  if (value === "staging" || value === "production") {
    return value;
  }
  return null;
};

export const main = async (): Promise<void> => {
  const environment = parseEnvironment(process.argv.slice(2));
  if (!environment) {
    throw new Error(
      "Usage: pnpm secrets:setup [--environment staging|production]"
    );
  }

  if (environment === "local") {
    const root = repoRootFrom(import.meta.dirname);
    const result = setupLocalEnvironment(root);
    process.stdout.write(formatSetupResult(result));
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return;
    }
    const selected = await chooseDeployment();
    if (!selected) {
      return;
    }
    const complete = await runDeploymentWizard(selected);
    if (complete && selected === "staging" && (await chooseProduction())) {
      await runDeploymentWizard("production");
    }
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Deployment setup requires an interactive terminal.");
  }
  const complete = await runDeploymentWizard(environment);
  if (complete && environment === "staging" && (await chooseProduction())) {
    await runDeploymentWizard("production");
  }
};

const cancellationNotice = (environment: string): string =>
  [
    "",
    "Setup cancelled.",
    "",
    "Configuration already applied has been preserved. Run:",
    "",
    `  pnpm secrets:setup${environment === "local" ? "" : ` --environment ${environment}`}`,
    "",
    "to continue.",
    "",
  ].join("\n");

if (import.meta.main) {
  const requested = parseEnvironment(process.argv.slice(2)) ?? "local";
  // Ctrl+C at a readline prompt kills the process without unwinding, so the
  // "nothing was rolled back" reassurance has to be printed from here.
  process.on("SIGINT", () => {
    process.stdout.write(cancellationNotice(requested));
    process.exit(130);
  });
  await main().catch((error: unknown) => {
    if (error instanceof SetupCancelledError) {
      process.stdout.write(cancellationNotice(requested));
      process.exitCode = 130;
      return;
    }
    process.stderr.write(
      `${error instanceof Error ? error.message : "Secrets setup failed."}\n`
    );
    process.exitCode = 1;
  });
}
