import type * as GatewayModule from "@masdan/api/ai/gateway";
import { hashLinkCode } from "@masdan/api/chat/chat.link";
import { receiveChatMessage } from "@masdan/api/chat/chat.receive";
import { ai } from "@masdan/api/transactions/quick-entry.golden";
import {
  chatLinkCode,
  financialAccount,
  financialTransaction,
} from "@masdan/db/schema/index";
import {
  drainQueue,
  getJobs,
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { handleChatProcess } from "./chat";

const TOKEN = vi.hoisted(() => "123456:test-token");

const completeJson = vi.hoisted(() => vi.fn());

vi.mock("@masdan/api/ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  completeJson,
  isAiConfigured: () => true,
}));
vi.mock("@masdan/api/feature-flags/feature-flags.cache", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));
vi.mock("@masdan/env/integrations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  env: { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: "x".repeat(20) },
}));

const fetchMock = vi.fn<typeof fetch>();

let nextMessageId = 700_000;

/** The receive half as the webhook calls it, then the worker. */
const deliver = async (senderId: string, text: string) => {
  nextMessageId += 1;
  const receipt = await receiveChatMessage(getTestDb(), "telegram", {
    conversationId: senderId,
    messageId: String(nextMessageId),
    sender: { id: senderId, name: "@mj" },
    text,
  });
  expect(receipt).toEqual({ kind: "accepted" });
  await drainQueue("chat.process", handleChatProcess);
};

const lastReply = (): { chat_id: string; text: string } => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  expect(String(url)).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
  return JSON.parse(String(init?.body)) as { chat_id: string; text: string };
};

beforeAll(startTestQueue);
afterAll(stopTestQueue);

beforeEach(() => {
  completeJson.mockReset();
  fetchMock
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(Response.json({ ok: true, result: {} }))
    );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat.process", () => {
  it("links, then turns a message into a transaction and replies on the channel", async () => {
    const db = getTestDb();
    const { headers, user } = await signUpTestUser();
    const current = await getSessionFor(headers);
    const organizationId = current?.session.activeOrganizationId ?? "";
    await db.insert(financialAccount).values({
      accountClass: "asset",
      accountType: "e_wallet",
      currencyCode: "PHP",
      name: "GCash",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      organizationId,
    });
    await db.insert(chatLinkCode).values({
      codeHash: hashLinkCode("ABCD-EFGH"),
      expiresAt: new Date(Date.now() + 60_000),
      organizationId,
      userId: user.id,
    });
    const senderId = "6100000001";

    await deliver(senderId, "/link abcd-efgh");
    expect(lastReply()).toMatchObject({
      chat_id: senderId,
      text: expect.stringMatching(/^Linked to /u),
    });

    completeJson.mockResolvedValue(
      ai({
        account: "gcash",
        amount: "180",
        category: "Food & Dining",
        kind: "expense",
      })
    );
    await deliver(senderId, "lunch 180 gcash");

    expect(lastReply().text).toBe("Added ₱180 expense\nLunch\nGCash");
    const rows = await db
      .select({ amount: financialTransaction.amount })
      .from(financialTransaction)
      .where(eq(financialTransaction.organizationId, organizationId));
    expect(rows).toEqual([{ amount: "180.000000" }]);
  });

  it("keeps the job successful when the reply cannot be sent", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        Response.json({ description: "Forbidden", ok: false }, { status: 403 })
      )
    );

    // An unlinked sender: nothing to write, only a reply that fails.
    await deliver("6100000002", "lunch 180 gcash");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const jobs = await getJobs("chat.process");
    const job = jobs.find(
      (candidate) => candidate.data.messageId === String(nextMessageId)
    );
    // A retry would find the message processed and could not resend anyway.
    expect(job?.state).toBe("completed");
  });

  it("drops a job for a channel this deploy has no adapter for", async () => {
    await expect(
      handleChatProcess({
        data: {
          channel: "pager",
          command: { text: "lunch 180", type: "entry" },
          conversationId: "1",
          messageId: "1",
          sender: { id: "1", name: null },
        },
        id: "job-1",
      } as Parameters<typeof handleChatProcess>[0])
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
