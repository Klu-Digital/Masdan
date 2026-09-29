import { aiUsage } from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@masdan/env/integrations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  env: { AI_DAILY_TOKEN_BUDGET: 1000 },
}));

const { aiTokensSpentToday, hasAiBudget, recordAiUsage } =
  await import("./usage");

const household = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return { db: getTestDb(), organizationId };
};

const MORNING = new Date("2026-09-29T00:30:00Z");
const EVENING = new Date("2026-09-29T23:30:00Z");
const NEXT_DAY = new Date("2026-09-30T00:00:00Z");

describe("AI usage", () => {
  it("adds each call's tokens to the household's UTC day", async () => {
    const home = await household();

    await recordAiUsage(home, 400, MORNING);
    await recordAiUsage(home, 250, EVENING);

    expect(await aiTokensSpentToday(home, EVENING)).toBe(650);
    const rows = await getTestDb().select().from(aiUsage);
    expect(rows).toEqual([
      {
        day: "2026-09-29",
        organizationId: home.organizationId,
        requests: 2,
        tokens: 650,
      },
    ]);
  });

  it("refuses once the budget is reached, until the next UTC day", async () => {
    const home = await household();

    await recordAiUsage(home, 999, MORNING);
    expect(await hasAiBudget(home, MORNING)).toBe(true);
    await recordAiUsage(home, 1, MORNING);

    expect(await hasAiBudget(home, EVENING)).toBe(false);
    expect(await hasAiBudget(home, NEXT_DAY)).toBe(true);
  });

  it("keeps each household's budget its own", async () => {
    const spender = await household();
    const other = await household();

    await recordAiUsage(spender, 1000, MORNING);

    expect(await hasAiBudget(spender, MORNING)).toBe(false);
    expect(await hasAiBudget(other, MORNING)).toBe(true);
  });
});
