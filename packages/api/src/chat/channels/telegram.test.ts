import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import type { ChatReceipt, InboundChatMessage } from "../chat.channel";

const SECRET = "test-webhook-secret-0123456789";
const TOKEN = "123456:test-token";

const mockEnv = vi.hoisted(() => ({
  TELEGRAM_BOT_TOKEN: undefined as string | undefined,
  TELEGRAM_WEBHOOK_SECRET: undefined as string | undefined,
}));
vi.mock("@masdan/env/integrations", () => ({ env: mockEnv }));

const { readTelegramUpdate, telegramChannel } = await import("./telegram");

const privateMessage = (text: string, from: Record<string, unknown> = {}) => ({
  chat: { id: 42, type: "private" },
  date: 1_790_000_000,
  from: { first_name: "MJ", id: 42, is_bot: false, username: "mj", ...from },
  message_id: 7,
  text,
});

const update = (
  message: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {}
) => ({ update_id: 1001, ...(message ? { message } : {}), ...extra });

const webhook = (body: unknown, secret: string | null = SECRET) =>
  new Request("http://localhost/chat/telegram/webhook", {
    body: JSON.stringify(body),
    headers: secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {},
    method: "POST",
  });

const receive = vi.fn<(message: InboundChatMessage) => Promise<ChatReceipt>>();
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  mockEnv.TELEGRAM_BOT_TOKEN = TOKEN;
  mockEnv.TELEGRAM_WEBHOOK_SECRET = SECRET;
  receive.mockReset().mockResolvedValue({ kind: "accepted" });
  fetchMock
    .mockReset()
    .mockResolvedValue(Response.json({ ok: true, result: {} }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTelegramUpdate", () => {
  it("reads a private text message into the channel-neutral shape", () => {
    expect(readTelegramUpdate(update(privateMessage(" dinner 400 ")))).toEqual({
      kind: "message",
      message: {
        conversationId: "42",
        messageId: "1001",
        sender: { id: "42", name: "@mj" },
        text: "dinner 400",
      },
    });
  });

  it("reads a photo's largest size and trimmed caption", () => {
    const read = readTelegramUpdate(
      update({
        ...privateMessage(""),
        caption: " metrobank mc ",
        photo: [
          { file_id: "small", file_size: 10, height: 20, width: 20 },
          { file_id: "large", file_size: 100, height: 200, width: 200 },
        ],
        text: undefined,
      })
    );
    expect(read).toMatchObject({
      kind: "message",
      message: {
        attachment: { contentType: "image/jpeg", ref: "large", size: 100 },
        text: "metrobank mc",
      },
    });
  });

  it("accepts an image document", () => {
    expect(
      readTelegramUpdate(
        update({
          ...privateMessage(""),
          document: {
            file_id: "doc",
            file_name: "receipt.png",
            file_size: 50,
            mime_type: "image/png",
          },
          text: undefined,
        })
      )
    ).toMatchObject({
      kind: "message",
      message: {
        attachment: {
          contentType: "image/png",
          name: "receipt.png",
          ref: "doc",
          size: 50,
        },
        text: "",
      },
    });
  });

  it("accepts a photo without a caption", () => {
    expect(
      readTelegramUpdate(
        update({
          ...privateMessage(""),
          photo: [{ file_id: "p", height: 1, width: 1 }],
          text: undefined,
        })
      )
    ).toMatchObject({
      kind: "message",
      message: { attachment: { ref: "p" }, text: "" },
    });
  });

  it("names a sender with no username by first name", () => {
    const read = readTelegramUpdate(
      update(privateMessage("dinner 400", { username: undefined }))
    );
    expect(read.kind === "message" && read.message.sender.name).toBe("MJ");
  });

  it.each([
    [
      "a group chat",
      update({ ...privateMessage("400"), chat: { id: -100, type: "group" } }),
    ],
    [
      "a supergroup",
      update({
        ...privateMessage("400"),
        chat: { id: -100, type: "supergroup" },
      }),
    ],
    [
      "an edited message",
      update(undefined, { edited_message: privateMessage("500") }),
    ],
    [
      "a channel post",
      update(undefined, { channel_post: privateMessage("400") }),
    ],
    ["a message from a bot", update(privateMessage("400", { is_bot: true }))],
    [
      "a sticker with no text",
      update({ ...privateMessage(""), text: undefined }),
    ],
    ["whitespace only", update(privateMessage("   "))],
  ])("ignores %s", (_, body) => {
    expect(readTelegramUpdate(body)).toEqual({ kind: "ignored" });
  });

  it.each([null, "text", {}, { update_id: "1" }, { update_id: 1.5 }])(
    "treats %j as malformed",
    (body) => {
      expect(readTelegramUpdate(body)).toEqual({ kind: "malformed" });
    }
  );
});

describe("telegramChannel.handleWebhook", () => {
  it("hands a verified message to the shared half and answers 200", async () => {
    const response = await telegramChannel.handleWebhook(
      webhook(update(privateMessage("dinner 400"))),
      receive
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "1001", text: "dinner 400" })
    );
  });

  it("returns a shared-half reply as a Bot API call in the response", async () => {
    receive.mockResolvedValue({ kind: "reply", text: "Try again" });

    const response = await telegramChannel.handleWebhook(
      webhook(update(privateMessage("dinner 400"))),
      receive
    );

    expect(await response.json()).toEqual({
      chat_id: "42",
      method: "sendMessage",
      text: "Try again",
    });
  });

  it.each([
    ["a wrong secret", "not-the-secret"],
    ["no secret", null],
  ])("rejects %s before reading anything", async (_, secret) => {
    const response = await telegramChannel.handleWebhook(
      webhook(update(privateMessage("dinner 400")), secret),
      receive
    );

    expect(response.status).toBe(401);
    expect(receive).not.toHaveBeenCalled();
  });

  it.each([
    ["the token", "TELEGRAM_BOT_TOKEN"],
    ["the secret", "TELEGRAM_WEBHOOK_SECRET"],
  ] as const)("does not exist without %s", async (_, name) => {
    mockEnv[name] = undefined;

    const response = await telegramChannel.handleWebhook(
      webhook(update(privateMessage("dinner 400"))),
      receive
    );

    expect(response.status).toBe(404);
    expect(telegramChannel.isConfigured()).toBe(false);
  });

  it("can send with the token alone, as apps/workers has no webhook secret", () => {
    mockEnv.TELEGRAM_WEBHOOK_SECRET = undefined;

    expect(telegramChannel.canSend()).toBe(true);
    expect(telegramChannel.isConfigured()).toBe(false);

    mockEnv.TELEGRAM_BOT_TOKEN = undefined;

    expect(telegramChannel.canSend()).toBe(false);
  });

  it("answers 200 to ignored updates and bodies that are not JSON", async () => {
    const group = await telegramChannel.handleWebhook(
      webhook(
        update({ ...privateMessage("400"), chat: { id: -1, type: "group" } })
      ),
      receive
    );
    const garbage = await telegramChannel.handleWebhook(
      new Request("http://localhost/chat/telegram/webhook", {
        body: "not json",
        headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
        method: "POST",
      }),
      receive
    );

    // Anything but 200 and Telegram redelivers forever.
    expect([group.status, garbage.status]).toEqual([200, 200]);
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("telegramChannel.download", () => {
  it("downloads bytes after getFile", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          ok: true,
          result: { file_path: "photos/p.jpg", file_size: 3 },
        })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([255, 216, 255])));
    expect(await telegramChannel.download?.("ref", 10)).toEqual(
      new Uint8Array([255, 216, 255])
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      file_id: "ref",
    });
  });

  it("rejects non-OK downloads without leaking credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ ok: true, result: { file_path: "p" } })
      )
      .mockResolvedValueOnce(new Response("No", { status: 404 }));
    const failure = telegramChannel.download?.("ref", 10);
    await expect(failure).rejects.toThrow(/download failed/u);
    await expect(failure).rejects.not.toThrow(TOKEN);
  });

  it.each(["declared", "header", "body"])(
    "rejects %s oversize without leaking credentials",
    async (which) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          ok: true,
          result: { file_path: "p", file_size: which === "declared" ? 100 : 3 },
        })
      );
      if (which === "header") {
        fetchMock.mockResolvedValueOnce(
          new Response("abc", { headers: { "content-length": "100" } })
        );
      }
      if (which === "body") {
        fetchMock.mockResolvedValueOnce(new Response("a".repeat(100)));
      }
      const failure = telegramChannel.download?.("ref", 10);
      await expect(failure).rejects.toThrow();
      await expect(failure).rejects.not.toThrow(TOKEN);
    }
  );
});

describe("telegramChannel.send", () => {
  it("sends plain text with no link previews", async () => {
    await telegramChannel.send("42", "Added ₱400 expense");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "42",
      link_preview_options: { is_disabled: true },
      text: "Added ₱400 expense",
    });
  });

  it("reports Telegram's refusal without the token", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ description: "Forbidden", ok: false }, { status: 403 })
    );

    const failure = telegramChannel.send("42", "hi");

    await expect(failure).rejects.toThrow(
      "sendMessage failed (403): Forbidden"
    );
    await expect(failure).rejects.not.toThrow(TOKEN);
  });
});
