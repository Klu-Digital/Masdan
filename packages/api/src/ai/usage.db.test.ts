import { auth } from "@masdan/auth";
import { aiUsage, aiUserUsage } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@masdan/env/integrations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  env: { AI_DAILY_TOKEN_BUDGET: 1000 },
}));

const { aiTokensSpentToday, hasAiBudget, recordAiUsage } =
  await import("./usage");

const spender = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return {
    db: getTestDb(),
    headers: user.headers,
    organizationId,
    userId: user.user.id,
  };
};

const MORNING = new Date("2026-09-29T00:30:00Z");
const EVENING = new Date("2026-09-29T23:30:00Z");
const NEXT_DAY = new Date("2026-09-30T00:00:00Z");

describe("AI usage", () => {
  it("adds each call's tokens to the household's and the person's UTC day", async () => {
    const { headers: _headers, ...home } = await spender();

    await recordAiUsage(home, 400, MORNING);
    await recordAiUsage(home, 250, EVENING);

    expect(await aiTokensSpentToday(home, EVENING)).toEqual({
      household: 650,
      user: 650,
    });
    expect(await getTestDb().select().from(aiUsage)).toEqual([
      {
        day: "2026-09-29",
        organizationId: home.organizationId,
        requests: 2,
        tokens: 650,
      },
    ]);
    expect(await getTestDb().select().from(aiUserUsage)).toEqual([
      { day: "2026-09-29", requests: 2, tokens: 650, userId: home.userId },
    ]);
  });

  it("refuses once the budget is reached, until the next UTC day", async () => {
    const home = await spender();

    await recordAiUsage(home, 999, MORNING);
    expect(await hasAiBudget(home, MORNING)).toBe(true);
    await recordAiUsage(home, 1, MORNING);

    expect(await hasAiBudget(home, EVENING)).toBe(false);
    expect(await hasAiBudget(home, NEXT_DAY)).toBe(true);
  });

  it("keeps each household's budget its own", async () => {
    const big = await spender();
    const other = await spender();

    await recordAiUsage(big, 1000, MORNING);

    expect(await hasAiBudget(big, MORNING)).toBe(false);
    expect(await hasAiBudget(other, MORNING)).toBe(true);
  });

  it("follows the person into a household they create, so a new one is no fresh budget", async () => {
    const home = await spender();
    const second = await auth.api.createOrganization({
      body: { name: "Second", slug: `second-${home.userId}` },
      headers: home.headers,
    });
    if (!second) {
      throw new Error("Could not create a second household");
    }

    await recordAiUsage(home, 1000, MORNING);

    expect(
      await hasAiBudget({ ...home, organizationId: second.id }, MORNING)
    ).toBe(false);
  });

  it("caps the household even when another member asks", async () => {
    const home = await spender();
    const member = await spender();

    await recordAiUsage(home, 1000, MORNING);

    expect(
      await hasAiBudget(
        { ...member, organizationId: home.organizationId },
        MORNING
      )
    ).toBe(false);
  });
});
