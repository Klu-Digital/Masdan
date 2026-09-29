import { log } from "@masdan/observability";
import { getSessionFor, signUpTestUser } from "@masdan/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { auth } from "./index";
import { issuePasswordResetLink, setPasswordByEmail } from "./recovery";

const PASSWORD = "old-password-123";

const signIn = (email: string, password: string) =>
  auth.api.signInEmail({ body: { email, password } });

const tokenOf = (url: string): string => {
  const token = new URL(url).searchParams.get("token");
  if (!token) {
    throw new Error(`no token in ${url}`);
  }
  return token;
};

/** Every argument ever handed to the structured logger, which drains to PostHog. */
const spyOnLogger = () => {
  const calls: unknown[][] = [];
  const methods = Object.entries(log).filter(
    ([, value]) => typeof value === "function"
  );
  expect(methods.map(([name]) => name)).toEqual(
    expect.arrayContaining(["info", "warn", "error"])
  );
  for (const [name] of methods) {
    vi.spyOn(log, name as keyof typeof log).mockImplementation(
      (...args: unknown[]) => {
        calls.push(args);
      }
    );
  }
  return () => JSON.stringify(calls);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setPasswordByEmail", () => {
  it("sets the password and revokes every session", async () => {
    const { user, headers } = await signUpTestUser({ password: PASSWORD });

    const result = await setPasswordByEmail(
      user.email.toUpperCase(),
      "brand-new-password"
    );

    expect(result).toMatchObject({ status: "ok", user: { id: user.id } });
    expect(await getSessionFor(headers)).toBeNull();
    await expect(signIn(user.email, PASSWORD)).rejects.toThrow();
    await expect(
      signIn(user.email, "brand-new-password")
    ).resolves.toMatchObject({ user: { id: user.id } });
  });

  it("reports an unknown email and rejects a too-short password", async () => {
    await expect(
      setPasswordByEmail("nobody@example.com", "long-enough-pw")
    ).resolves.toEqual({ status: "no-user" });
    await expect(setPasswordByEmail("x@example.com", "short")).rejects.toThrow(
      /characters/u
    );
  });
});

describe("issuePasswordResetLink", () => {
  it("links to the web page with a single-use token that revokes sessions", async () => {
    const { user, headers } = await signUpTestUser({ password: PASSWORD });

    const { url } = await issuePasswordResetLink(user.id);
    const token = tokenOf(url);

    expect(url.startsWith("http://localhost:2600/reset-password?token=")).toBe(
      true
    );
    await auth.api.resetPassword({
      body: { newPassword: "reset-by-admin-1", token },
    });
    expect(await getSessionFor(headers)).toBeNull();
    await expect(signIn(user.email, "reset-by-admin-1")).resolves.toMatchObject(
      { user: { id: user.id } }
    );
    await expect(
      auth.api.resetPassword({ body: { newPassword: "again-again-1", token } })
    ).rejects.toThrow();
  });
});

describe("reset links never reach the structured logger", () => {
  it("writes the self-service link to stdout only", async () => {
    const { user } = await signUpTestUser({ password: PASSWORD });
    const logged = spyOnLogger();
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await auth.api.requestPasswordReset({ body: { email: user.email } });

    const written = stdout.mock.calls.map(([chunk]) => String(chunk)).join("");
    const url = /http\S+reset-password\?token=\S+/u.exec(written)?.[0];
    expect(url).toBeDefined();
    const token = tokenOf(url ?? "");
    expect(logged()).not.toContain(token);
    await expect(
      auth.api.resetPassword({ body: { newPassword: "from-stdout-1", token } })
    ).resolves.toMatchObject({ status: true });
  });

  it("does not log an admin-issued link", async () => {
    const { user } = await signUpTestUser();
    const logged = spyOnLogger();

    const { url } = await issuePasswordResetLink(user.id);

    expect(logged()).not.toContain(tokenOf(url));
  });
});
