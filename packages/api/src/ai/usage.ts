import type { Database } from "@masdan/db";
import { aiUsage } from "@masdan/db/schema/index";
import { env } from "@masdan/env/integrations";
import { and, eq, sql } from "drizzle-orm";

/** Whose budget an AI call spends. Never a transaction: a rollback would refund the tokens. */
export interface AiHousehold {
  db: Database;
  organizationId: string;
}

const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

export const aiTokensSpentToday = async (
  { db, organizationId }: AiHousehold,
  now = new Date()
): Promise<number> => {
  const [row] = await db
    .select({ tokens: aiUsage.tokens })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.organizationId, organizationId),
        eq(aiUsage.day, utcDay(now))
      )
    );
  return row?.tokens ?? 0;
};

// Concurrent calls can each overshoot by one completion.
export const hasAiBudget = async (
  household: AiHousehold,
  now = new Date()
): Promise<boolean> =>
  (await aiTokensSpentToday(household, now)) < env.AI_DAILY_TOKEN_BUDGET;

export const recordAiUsage = async (
  { db, organizationId }: AiHousehold,
  tokens: number,
  now = new Date()
): Promise<void> => {
  await db
    .insert(aiUsage)
    .values({ day: utcDay(now), organizationId, requests: 1, tokens })
    .onConflictDoUpdate({
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        tokens: sql`${aiUsage.tokens} + ${tokens}`,
      },
      target: [aiUsage.organizationId, aiUsage.day],
    });
};
