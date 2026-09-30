import { addDays } from "@masdan/api/recurring/recurrence";
import { householdToday } from "@masdan/api/reports/periods";
import {
  financialAccount,
  financialAccountInterest,
  financialAccountInterestRate,
  financialTransaction,
  interestProduct,
} from "@masdan/db/schema/index";
import { queue } from "@masdan/queue";
import {
  drainQueue,
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { handleInterestPost, handleInterestSweep } from "./interest";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const today = () => householdToday("Asia/Manila", new Date());

/** A MariBank account opened, and set to post, five days ago. */
const mariAccount = async (autoPost: boolean): Promise<string> => {
  const db = getTestDb();
  const { headers } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
  const opened = addDays(today(), -5);
  const [account] = await db
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: "PHP",
      name: "Mari",
      openingBalance: "100000",
      openingBalanceDate: opened,
      organizationId,
    })
    .returning({ id: financialAccount.id });
  const [product] = await db
    .select({ id: interestProduct.id })
    .from(interestProduct)
    .where(eq(interestProduct.key, "ph-maribank-savings"));
  const accountId = account?.id ?? "";
  await db.insert(financialAccountInterest).values({
    accountId,
    autoPost,
    createdAt: new Date(`${opened}T04:00:00Z`),
    organizationId,
    productId: product?.id ?? null,
  });
  await db.insert(financialAccountInterestRate).values({
    accountId,
    effectiveFrom: opened,
    followsPreset: true,
    organizationId,
  });
  return accountId;
};

describe("interest handlers", () => {
  it("sweeps accounts that post interest and posts each finished day", async () => {
    const posting = await mariAccount(true);
    const quiet = await mariAccount(false);

    await queue.enqueue("interest.sweep", {});
    expect(await drainQueue("interest.sweep", handleInterestSweep)).toBe(1);
    const queuedJobs = await getQueuedJobs("interest.post");
    const queued = queuedJobs.map((job) => job.data.accountId);
    expect(queued).toContain(posting);
    expect(queued).not.toContain(quiet);

    await drainQueue("interest.post", handleInterestPost);
    const postings = await getTestDb()
      .select({ date: financialTransaction.transactionDate })
      .from(financialTransaction)
      .where(eq(financialTransaction.accountId, posting));
    // Five finished days: today's credit waits for tomorrow.
    expect(postings.map(({ date }) => date).toSorted()).toEqual(
      [5, 4, 3, 2, 1].map((days) => addDays(today(), -days))
    );
  });

  it("posts each credit once when the same account is queued twice", async () => {
    const accountId = await mariAccount(true);

    await queue.enqueue("interest.post", { accountId });
    await drainQueue("interest.post", handleInterestPost);
    await queue.enqueue("interest.post", { accountId });
    await drainQueue("interest.post", handleInterestPost);

    const postings = await getTestDb()
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(eq(financialTransaction.accountId, accountId));
    expect(postings).toHaveLength(5);
  });
});
