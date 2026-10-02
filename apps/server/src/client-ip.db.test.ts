import { CLIENT_IP_HEADER } from "@masdan/auth/client-ip";
import { db } from "@masdan/db";
import { session } from "@masdan/db/schema/auth";
import type * as TypeImport__masdan_env_server from "@masdan/env/server";
import { signUpTestUser } from "@masdan/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vite-plus/test";

// One proxy in front, as with the web image's nginx alone.
vi.mock("@masdan/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport__masdan_env_server>();
  return { ...actual, env: { ...actual.env, TRUSTED_PROXY_HOPS: 1 } };
});

const { env } = await import("@masdan/env/server");
const { createApp } = await import("./app");

describe("better-auth's client IP", () => {
  it("is the one the proxy appended, not one the caller forged", async () => {
    const password = "correct-horse-battery";
    const { user } = await signUpTestUser({ password });

    const response = await createApp().request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email: user.email, password }),
      headers: {
        [CLIENT_IP_HEADER]: "198.51.100.66",
        "content-type": "application/json",
        origin: env.CORS_ORIGIN,
        "x-forwarded-for": "198.51.100.66, 203.0.113.7",
      },
      method: "POST",
    });
    expect(response.status).toBe(200);

    const sessions = await db
      .select({ ipAddress: session.ipAddress })
      .from(session)
      .where(eq(session.userId, user.id));
    expect(sessions.map((row) => row.ipAddress)).toContain("203.0.113.7");
    expect(sessions.map((row) => row.ipAddress)).not.toContain("198.51.100.66");
  });
});
