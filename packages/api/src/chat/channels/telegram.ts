import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@masdan/env/integrations";
import { log } from "@masdan/observability";
import { z } from "zod";

import type { ChatChannelAdapter, InboundChatMessage } from "../chat.channel";

/** A hung reply must not hold the worker past the job's expiry. */
const TELEGRAM_TIMEOUT_MS = 10_000;

/** Only the fields read below; everything else in an update is dropped. */
const telegramUpdate = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number().int(), type: z.string() }),
      from: z
        .object({
          first_name: z.string().max(128).optional(),
          id: z.number().int(),
          is_bot: z.boolean(),
          username: z.string().max(64).optional(),
        })
        .optional(),
      text: z.string().optional(),
    })
    .optional(),
  update_id: z.number().int(),
});

export type TelegramUpdateRead =
  | { kind: "malformed" }
  | { kind: "ignored" }
  | { kind: "message"; message: InboundChatMessage };

/**
 * Telegram input is untrusted: anything that isn't a text message from a
 * person in a private chat is ignored.
 */
export const readTelegramUpdate = (body: unknown): TelegramUpdateRead => {
  const parsed = telegramUpdate.safeParse(body);
  if (!parsed.success) {
    return { kind: "malformed" };
  }
  const { message, update_id: updateId } = parsed.data;
  const text = message?.text?.trim();
  // Edited messages arrive as `edited_message`, so `message` is absent.
  if (
    !(message?.from && text) ||
    message.chat.type !== "private" ||
    message.from.is_bot
  ) {
    return { kind: "ignored" };
  }
  const { from } = message;

  return {
    kind: "message",
    message: {
      conversationId: String(message.chat.id),
      messageId: String(updateId),
      sender: {
        id: String(from.id),
        name: from.username ? `@${from.username}` : (from.first_name ?? null),
      },
      text,
    },
  };
};

const credentials = () =>
  env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET
    ? { botToken: env.TELEGRAM_BOT_TOKEN, secret: env.TELEGRAM_WEBHOOK_SECRET }
    : null;

// Hashed first so the comparison is constant-time whatever the lengths.
const secretMatches = (expected: string, received: string | null) =>
  received !== null &&
  timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(received).digest()
  );

/**
 * One Bot API call. The token is part of the URL, so errors are rebuilt from
 * Telegram's `description` rather than passed through with the request.
 */
export const callTelegram = async (
  botToken: string,
  method: string,
  body: Record<string, unknown>
): Promise<unknown> => {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    }
  );
  const json = (await response.json().catch(() => null)) as {
    description?: string;
    ok?: boolean;
    result?: unknown;
  } | null;
  if (!json?.ok) {
    throw new Error(
      `Telegram ${method} failed (${response.status}): ${json?.description ?? "no description"}`
    );
  }
  return json.result;
};

/**
 * Verified by the `secret_token` given to `setWebhook`. Anything that isn't a
 * rejection answers 200, since any other status makes Telegram redeliver the
 * update indefinitely. A shared-half reply rides back in the response body as
 * a Bot API call Telegram performs, so the server needs no outbound request.
 */
export const telegramChannel: ChatChannelAdapter = {
  handleWebhook: async (request, receive) => {
    const config = credentials();
    if (!config) {
      return Response.json({}, { status: 404 });
    }
    if (
      !secretMatches(
        config.secret,
        request.headers.get("x-telegram-bot-api-secret-token")
      )
    ) {
      log.warn({ action: "chat.webhook.rejected", channel: "telegram" });
      return Response.json({}, { status: 401 });
    }

    const update = readTelegramUpdate(await request.json().catch(() => null));
    if (update.kind !== "message") {
      return Response.json({});
    }
    const receipt = await receive(update.message);
    return Response.json(
      receipt.kind === "reply"
        ? {
            chat_id: update.message.conversationId,
            method: "sendMessage",
            text: receipt.text,
          }
        : {}
    );
  },
  isConfigured: () => credentials() !== null,
  label: "Telegram",
  send: async (conversationId, text) => {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }
    await callTelegram(botToken, "sendMessage", {
      chat_id: conversationId,
      link_preview_options: { is_disabled: true },
      text,
    });
  },
};
