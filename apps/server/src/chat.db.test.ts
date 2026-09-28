import { chatInboundMessage } from "@masdan/db/schema/index";
import {
  getJobs,
  getTestDb,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const SECRET = vi.hoisted(() => "test-webhook-secret-0123456789");

const isFeatureEnabled = vi.hoisted(() => vi.fn());

vi.mock("@masdan/env/integrations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  env: { TELEGRAM_BOT_TOKEN: "123456:test", TELEGRAM_WEBHOOK_SECRET: SECRET },
}));
vi.mock("@masdan/api/feature-flags/feature-flags.cache", () => ({
  isFeatureEnabled,
}));

const { createApp } = await import("./app");

const app = createApp();

let nextUpdateId = 900_000;

const PRIVATE_CHAT = { id: 42, type: "private" };

const messageUpdate = (text: string, chat = PRIVATE_CHAT) => {
  nextUpdateId += 1;
  return {
    message: {
      chat,
      from: { first_name: "MJ", id: 42, is_bot: false, username: "mj" },
      text,
    },
    update_id: nextUpdateId,
  };
};

const post = (body: unknown, path = "/chat/telegram/webhook") =>
  app.request(path, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": SECRET,
    },
    method: "POST",
  });

const jobsFor = async (messageId: number) => {
  const jobs = await getJobs("chat.process");
  return jobs.filter((job) => job.data.messageId === String(messageId));
};

const recorded = async (messageId: number): Promise<boolean> => {
  const rows = await getTestDb().select().from(chatInboundMessage);
  return rows.some(
    (row) => row.channel === "telegram" && row.messageId === String(messageId)
  );
};

beforeAll(startTestQueue);
afterAll(stopTestQueue);

beforeEach(() => {
  isFeatureEnabled.mockReset().mockResolvedValue(true);
});

describe("/chat/:channel/webhook", () => {
  it("records the message and enqueues it, answering at once", async () => {
    const update = messageUpdate("dinner at jollibee 400 metrobank mc");

    const response = await post(update);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(await recorded(update.update_id)).toBe(true);
    const [job] = await jobsFor(update.update_id);
    expect(job?.data).toEqual({
      channel: "telegram",
      command: { text: "dinner at jollibee 400 metrobank mc", type: "entry" },
      conversationId: "42",
      messageId: String(update.update_id),
      sender: { id: "42", name: "@mj" },
    });
  });

  it("enqueues a retried delivery of the same message only once", async () => {
    const update = messageUpdate("dinner 400");

    const first = await post(update);
    const second = await post(update);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await jobsFor(update.update_id)).toHaveLength(1);
  });

  it("answers 404 for a channel with no adapter", async () => {
    const response = await post(
      messageUpdate("dinner 400"),
      "/chat/pager/webhook"
    );

    expect(response.status).toBe(404);
  });

  it("answers 200 and ignores the message while the flag is off", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    const update = messageUpdate("dinner 400");

    const response = await post(update);

    expect(response.status).toBe(200);
    expect(await recorded(update.update_id)).toBe(false);
    expect(await jobsFor(update.update_id)).toHaveLength(0);
  });

  it("answers help through the channel's own reply, with no job", async () => {
    const update = messageUpdate("/start");

    const response = await post(update);

    expect(await response.json()).toMatchObject({
      chat_id: "42",
      method: "sendMessage",
    });
    expect(await jobsFor(update.update_id)).toHaveLength(0);
  });

  it("tells the sender to try again when the queue is down, and keeps no record", async () => {
    await stopTestQueue();
    const update = messageUpdate("dinner 400");

    try {
      const response = await post(update);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        chat_id: "42",
        text: expect.stringMatching(/Send it again/u),
      });
      // Rolled back with the failed enqueue, so a resend is not a duplicate.
      expect(await recorded(update.update_id)).toBe(false);
    } finally {
      await startTestQueue();
    }
  });
});
