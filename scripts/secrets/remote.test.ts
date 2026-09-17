import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { emptyRemoteState, planWrites } from "./plan";
import { createDokployClient, createGitHubClient, probeGitHub } from "./remote";
import { applyDokploy, applyGitHub } from "./wizard";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const runGh = vi.mocked(execFileSync);

/** Stand-in for real secret material. It must never leave this file. */
const CANARY = "THIS_MUST_NEVER_APPEAR";

interface GhCall {
  args: string[];
  input?: string;
}

const calls = (): GhCall[] =>
  runGh.mock.calls.map(([, args, options]) => ({
    args: (args ?? []) as string[],
    input: (options as { input?: string } | undefined)?.input,
  }));

beforeEach(() => {
  runGh.mockReset();
  runGh.mockReturnValue("[]" as never);
});

describe("GitHub CLI adapter", () => {
  it("passes secret material through stdin, never argv", () => {
    createGitHubClient().setSecret("DATABASE_URL", CANARY, "staging");

    const [call] = calls();
    expect(call?.args).toContain("secret");
    expect(call?.args.join(" ")).not.toContain(CANARY);
    expect(call?.input).toContain(CANARY);
  });

  it("scopes a secret to the requested environment", () => {
    const github = createGitHubClient();
    github.setSecret("DOKPLOY_TOKEN", CANARY, "production");

    const [call] = calls();
    expect(call?.args).toEqual([
      "secret",
      "set",
      "DOKPLOY_TOKEN",
      "--env",
      "production",
    ]);
  });

  it("writes a repository-scoped secret without an environment flag", () => {
    createGitHubClient().setSecret("POSTHOG_PERSONAL_API_KEY", CANARY);

    const [call] = calls();
    expect(call?.args).not.toContain("--env");
    expect(call?.args.join(" ")).not.toContain(CANARY);
  });

  it("keeps the secret out of a failure message", () => {
    runGh.mockImplementation(() => {
      // execFileSync attaches the child's output to the error it throws, which
      // for `secret set` can echo back what we piped in.
      const error = new Error(`gh failed: ${CANARY}`);
      throw Object.assign(error, { stderr: CANARY, stdout: CANARY });
    });

    let message = "";
    try {
      createGitHubClient().setSecret("DATABASE_URL", CANARY, "staging");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBe("");
    expect(message).not.toContain(CANARY);
  });

  it("reads only names, never secret values", () => {
    runGh.mockReturnValue(JSON.stringify([{ name: "DATABASE_URL" }]) as never);

    const snapshot = createGitHubClient().snapshot("staging");

    expect(snapshot.environmentSecrets.has("DATABASE_URL")).toBe(true);
    for (const call of calls()) {
      expect(call.args).not.toContain("value");
    }
  });

  it("reports an unauthenticated CLI instead of throwing", () => {
    runGh.mockImplementation(() => {
      throw new Error("gh: not logged in");
    });

    const availability = probeGitHub();

    expect(availability.available).toBe(false);
    expect(availability.reason).toContain("gh");
  });

  it("reports an existing environment as absent rather than failing", () => {
    runGh.mockImplementation(() => {
      throw new Error("404");
    });

    expect(createGitHubClient().environmentExists("staging")).toBe(false);
  });
});

const collection = (entries: [string, string][]) => ({
  order: entries.map(([name]) => name),
  values: new Map(entries),
});

describe("applying a plan to GitHub", () => {
  it("writes staging values to staging and nothing else", () => {
    const state = emptyRemoteState();
    const writes = planWrites(
      ["DATABASE_URL", "DOKPLOY_URL"],
      "staging",
      state
    );

    applyGitHub(
      writes,
      collection([
        ["DATABASE_URL", CANARY],
        ["DOKPLOY_URL", "https://dokploy.example.com"],
      ]),
      createGitHubClient(),
      "staging"
    );

    const flattened = calls();
    expect(flattened.length).toBeGreaterThan(0);
    for (const call of flattened) {
      expect(call.args).not.toContain("production");
      expect(call.args.join(" ")).not.toContain(CANARY);
    }
    expect(
      flattened.some(
        (call) => call.args.includes("--env") && call.args.includes("staging")
      )
    ).toBe(true);
  });

  it("writes production values to production and nothing else", () => {
    const writes = planWrites(
      ["DATABASE_URL"],
      "production",
      emptyRemoteState()
    );

    applyGitHub(
      writes,
      collection([["DATABASE_URL", CANARY]]),
      createGitHubClient(),
      "production"
    );

    for (const call of calls()) {
      expect(call.args).not.toContain("staging");
    }
    expect(calls().some((call) => call.args.includes("production"))).toBe(true);
  });

  it("skips a name that was never collected", () => {
    const writes = planWrites(["DATABASE_URL"], "staging", emptyRemoteState());

    applyGitHub(writes, collection([]), createGitHubClient(), "staging");

    expect(calls()).toHaveLength(0);
  });
});

describe("Dokploy adapter", () => {
  const fetchMock = vi.fn();

  const respond = (body: unknown) =>
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve(body),
      ok: true,
      status: 200,
    });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends the token as a header, never in the URL", async () => {
    respond({ env: "" });
    await createDokployClient(
      "https://dokploy.example.com",
      CANARY
    ).getApplication("app-1");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain(CANARY);
    expect(
      (init as { headers: Record<string, string> }).headers["x-api-key"]
    ).toBe(CANARY);
  });

  it("discovers applications from the project listing", async () => {
    respond([
      {
        applications: [
          { applicationId: "srv-1", name: "masdan-server" },
          { applicationId: "wrk-1", name: "masdan-workers" },
        ],
        name: "masdan",
      },
    ]);

    const discovered = await createDokployClient(
      "https://dokploy.example.com",
      CANARY
    ).listApplications();

    expect(discovered).toEqual([
      { applicationId: "srv-1", label: "masdan / masdan-server" },
      { applicationId: "wrk-1", label: "masdan / masdan-workers" },
    ]);
  });

  it("falls back to an empty list rather than failing discovery", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: false,
      status: 500,
    });

    const discovered = await createDokployClient(
      "https://dokploy.example.com",
      CANARY
    ).listApplications();

    expect(discovered).toEqual([]);
  });

  it("reads existing variable names out of the environment text", async () => {
    respond({ env: "DATABASE_URL=postgres://x\nREDIS_URL=redis://y\n" });

    const state = await createDokployClient(
      "https://dokploy.example.com",
      CANARY
    ).getApplication("app-1");

    expect([...state.names].toSorted()).toEqual(["DATABASE_URL", "REDIS_URL"]);
  });

  it("appends to the existing environment instead of replacing it", async () => {
    respond({});
    const client = createDokployClient("https://dokploy.example.com", "token");
    const applications = [
      {
        id: "srv-1",
        name: "server" as const,
        state: {
          envText: "EXISTING=keep-me\n",
          names: new Set(["EXISTING"]),
        },
      },
    ];

    await applyDokploy(
      planWrites(["BETTER_AUTH_SECRET"], "staging", emptyRemoteState()),
      {
        order: ["BETTER_AUTH_SECRET"],
        values: new Map([["BETTER_AUTH_SECRET", CANARY]]),
      },
      client,
      applications
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse((init as { body: string }).body) as {
      env: string;
    };
    expect(body.env).toContain("EXISTING=keep-me");
    expect(body.env).toContain(`BETTER_AUTH_SECRET=${CANARY}`);
    expect(applications[0]?.state.names.has("BETTER_AUTH_SECRET")).toBe(true);
  });

  it("does not send a server-only secret to the workers application", async () => {
    respond({});
    const client = createDokployClient("https://dokploy.example.com", "token");
    const workers = {
      id: "wrk-1",
      name: "workers" as const,
      state: { envText: "", names: new Set<string>() },
    };

    await applyDokploy(
      planWrites(["BETTER_AUTH_SECRET"], "staging", emptyRemoteState()),
      {
        order: ["BETTER_AUTH_SECRET"],
        values: new Map([["BETTER_AUTH_SECRET", CANARY]]),
      },
      client,
      [workers]
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(workers.state.names.has("BETTER_AUTH_SECRET")).toBe(false);
  });
});
