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

  it("enqueues a photo with its caption as a receipt job", async () => {
    const update = messageUpdate("");
    update.message.text = "";
    const body = {
      ...update,
      message: {
        ...update.message,
        caption: "metrobank mc",
        photo: [
          { file_id: "small", file_size: 10, height: 10, width: 10 },
          { file_id: "large", file_size: 30, height: 30, width: 30 },
        ],
      },
    };
    const response = await post(body);
    expect(response.status).toBe(200);
    const [job] = await jobsFor(update.update_id);
    expect(job?.data.command).toEqual({
      caption: "metrobank mc",
      file: { contentType: "image/jpeg", name: null, ref: "large", size: 30 },
      type: "receipt",
    });
  });

  it("replies immediately to an unsupported document without enqueueing", async () => {
    const update = messageUpdate("");
    const body = {
      ...update,
      message: {
        ...update.message,
        document: {
          file_id: "pdf",
          file_size: 200,
          mime_type: "application/pdf",
        },
      },
    };
    const response = await post(body);
    expect(await response.json()).toMatchObject({
      text: expect.stringMatching(/PDFs aren’t supported/u),
    });
    expect(await jobsFor(update.update_id)).toHaveLength(0);
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

  it("stops one sender's link attempts after five, without a job", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const accepted = await post(
        messageUpdate(`/link AAAA-AAA${attempt + 2}`)
      );
      expect(await accepted.json()).toEqual({});
    }
    const update = messageUpdate("/link AAAA-AAA9");

    const response = await post(update);

    expect(await response.json()).toMatchObject({
      text: expect.stringMatching(/Too many link attempts/u),
    });
    expect(await jobsFor(update.update_id)).toHaveLength(0);
  });

  it("stops a code's fourth attempt, whoever sends it", async () => {
    const fromSender = (id: number) => {
      const update = messageUpdate("/link bbbb-cccc");
      update.message.from.id = id;
      return update;
    };
    for (const senderId of [101, 102, 103]) {
      const accepted = await post(fromSender(senderId));
      expect(await accepted.json()).toEqual({});
    }
    const update = fromSender(104);

    const response = await post(update);

    expect(await response.json()).toMatchObject({
      text: expect.stringMatching(/Too many link attempts/u),
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
