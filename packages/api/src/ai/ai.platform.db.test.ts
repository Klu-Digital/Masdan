import { user } from "@masdan/db/schema/auth";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { aiPlatformRouter } from "./ai.platform";
import { DEFAULT_AI_TOKEN_CAPS } from "./features";
import { getAiTokenCaps, invalidateAiTokenCaps } from "./token-caps.cache";

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof ORPCError ? error.code : undefined;
  }
};

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const adminContext = async (): Promise<Context> => {
  const { headers, user: signedUpUser } = await signUpTestUser();
  await getTestDb()
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, signedUpUser.id));
  return await contextFor(headers);
};

beforeEach(() => {
  invalidateAiTokenCaps();
});

describe("admin.ai token caps", () => {
  it("lists every feature at its default until an admin overrides it", async () => {
    const context = await adminContext();

    const before = await call(aiPlatformRouter.tokenCaps, undefined, {
      context,
    });
    expect(
      before.caps.find((cap) => cap.feature === "categorize")
    ).toMatchObject({
      defaultMaxTokens: 8000,
      maxTokens: 8000,
      overridden: false,
    });

    await call(
      aiPlatformRouter.setTokenCap,
      { feature: "categorize", maxTokens: 3000 },
      { context }
    );

    const after = await call(aiPlatformRouter.tokenCaps, undefined, {
      context,
    });
    expect(
      after.caps.find((cap) => cap.feature === "categorize")
    ).toMatchObject({
      defaultMaxTokens: 8000,
      maxTokens: 3000,
      overridden: true,
      updatedByEmail: context.session?.user.email,
    });
  });

  it("feeds the gateway's cache on set and back to the default on reset", async () => {
    const context = await adminContext();
    expect(await getAiTokenCaps(getTestDb())).toEqual(DEFAULT_AI_TOKEN_CAPS);

    await call(
      aiPlatformRouter.setTokenCap,
      { feature: "receipt", maxTokens: 1500 },
      { context }
    );
    const updated = await getAiTokenCaps(getTestDb());
    expect(updated.receipt).toBe(1500);

    await call(
      aiPlatformRouter.resetTokenCap,
      { feature: "receipt" },
      { context }
    );
    const restored = await getAiTokenCaps(getTestDb());
    expect(restored.receipt).toBe(DEFAULT_AI_TOKEN_CAPS.receipt);
  });

  it.each([0, 63, 32_001, 1.5])("refuses a cap of %s", async (maxTokens) => {
    const context = await adminContext();

    expect(
      await codeOf(
        call(
          aiPlatformRouter.setTokenCap,
          { feature: "askMasdan", maxTokens },
          { context }
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("is admin-only", async () => {
    const { headers } = await signUpTestUser();
    const context = await contextFor(headers);

    expect(
      await codeOf(
        call(
          aiPlatformRouter.setTokenCap,
          { feature: "askMasdan", maxTokens: 1000 },
          { context }
        )
      )
    ).toBe("FORBIDDEN");
  });
});
