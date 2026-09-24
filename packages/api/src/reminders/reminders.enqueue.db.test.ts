import {
  getQueuedJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

const setUp = async () => {
  const { headers } = await signUpTestUser();
  const session = await getSessionFor(headers);
  const household = {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session,
    } as unknown as Context,
  };
  return {
    household,
    organizationId: session?.session.activeOrganizationId ?? "",
  };
};

const refreshesQueued = async () => {
  const queued = await getQueuedJobs("reminders.refresh");
  return queued.map((job) => job.data.organizationId);
};

describe("reminder refresh enqueueing", () => {
  it("asks the worker to refresh when a card or statement changes, once per household", async () => {
    const { household, organizationId } = await setUp();

    const card = await call(
      accountsRouter.create,
      {
        accountClass: "liability",
        accountType: "credit_card",
        name: "BPI Visa",
        ownerMemberIds: [],
        paymentDueDay: 10,
      },
      household
    );
    expect(await refreshesQueued()).toEqual([organizationId]);

    await call(
      accountsRouter.createStatement,
      {
        accountId: card.id,
        dueDate: "2026-03-10",
        periodEnd: "2026-02-15",
        periodStart: "2026-01-16",
        statementBalance: "12000",
        statementDate: "2026-02-15",
      },
      household
    );
    // Still one: the queued refresh already covers the new statement.
    expect(await refreshesQueued()).toEqual([organizationId]);
  });

  it("leaves non-card accounts alone", async () => {
    const { household } = await setUp();

    await call(
      accountsRouter.create,
      {
        accountClass: "asset",
        accountType: "bank",
        liquidity: "liquid",
        name: "BPI Savings",
        ownerMemberIds: [],
      },
      household
    );
    expect(await refreshesQueued()).toEqual([]);
  });
});
