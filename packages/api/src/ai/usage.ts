import type { Database } from "@masdan/db";
import { aiUsage, aiUserUsage } from "@masdan/db/schema/index";
import { env } from "@masdan/env/integrations";
import { and, eq, sql } from "drizzle-orm";

/** Who pays for an AI call: the household and the person asking, each capped. Never a transaction: a rollback would refund the tokens. */
export interface AiSpender {
  db: Database;
  organizationId: string;
  userId: string;
}

const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

export const aiTokensSpentToday = async (
  { db, organizationId, userId }: AiSpender,
  now = new Date()
): Promise<{ household: number; user: number }> => {
  const day = utcDay(now);
  const [[household], [person]] = await Promise.all([
    db
      .select({ tokens: aiUsage.tokens })
      .from(aiUsage)
      .where(
        and(eq(aiUsage.organizationId, organizationId), eq(aiUsage.day, day))
      ),
    db
      .select({ tokens: aiUserUsage.tokens })
      .from(aiUserUsage)
      .where(and(eq(aiUserUsage.userId, userId), eq(aiUserUsage.day, day))),
  ]);
  return { household: household?.tokens ?? 0, user: person?.tokens ?? 0 };
};

// Concurrent calls can each overshoot by one completion.
export const hasAiBudget = async (
  spender: AiSpender,
  now = new Date()
): Promise<boolean> => {
  const spent = await aiTokensSpentToday(spender, now);
  return (
    spent.household < env.AI_DAILY_TOKEN_BUDGET &&
    spent.user < env.AI_DAILY_TOKEN_BUDGET
  );
};

export const recordAiUsage = async (
  { db, organizationId, userId }: AiSpender,
  tokens: number,
  now = new Date()
): Promise<void> => {
  const day = utcDay(now);
  await Promise.all([
    db
      .insert(aiUsage)
      .values({ day, organizationId, requests: 1, tokens })
      .onConflictDoUpdate({
        set: {
          requests: sql`${aiUsage.requests} + 1`,
          tokens: sql`${aiUsage.tokens} + ${tokens}`,
        },
        target: [aiUsage.organizationId, aiUsage.day],
      }),
    db
      .insert(aiUserUsage)
      .values({ day, requests: 1, tokens, userId })
      .onConflictDoUpdate({
        set: {
          requests: sql`${aiUserUsage.requests} + 1`,
          tokens: sql`${aiUserUsage.tokens} + ${tokens}`,
        },
        target: [aiUserUsage.userId, aiUserUsage.day],
      }),
  ]);
};
