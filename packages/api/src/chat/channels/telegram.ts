import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@masdan/env/integrations";
import { log, parseError } from "@masdan/observability";
import { z } from "zod";

import type { ChatChannelAdapter, InboundChatMessage } from "../chat.channel";

/** A hung reply must not hold the worker past the job's expiry. */
const TELEGRAM_TIMEOUT_MS = 10_000;

/** Only the fields read below; everything else in an update is dropped. */
const telegramUpdate = z.object({
  message: z
    .object({
      caption: z.string().optional(),
      chat: z.object({ id: z.number().int(), type: z.string() }),
      document: z
        .object({
          file_id: z.string(),
          file_name: z.string().optional(),
          file_size: z.number().int().nonnegative().optional(),
          mime_type: z.string().optional(),
        })
        .optional(),
      from: z
        .object({
          first_name: z.string().max(128).optional(),
          id: z.number().int(),
          is_bot: z.boolean(),
          username: z.string().max(64).optional(),
        })
        .optional(),
      photo: z
        .array(
          z.object({
            file_id: z.string(),
            file_size: z.number().int().nonnegative().optional(),
            height: z.number(),
            width: z.number(),
          })
        )
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

const readAttachment = (
  message: NonNullable<z.infer<typeof telegramUpdate>["message"]>
) => {
  const photo = message.photo?.at(-1);
  if (photo) {
    return {
      contentType: "image/jpeg",
      name: null,
      ref: photo.file_id,
      size: photo.file_size ?? null,
    };
  }
  const { document } = message;
  return document
    ? {
        contentType: document.mime_type ?? null,
        name: document.file_name ?? null,
        ref: document.file_id,
        size: document.file_size ?? null,
      }
    : null;
};

/** Telegram input is untrusted; only private messages from people are accepted. */
export const readTelegramUpdate = (body: unknown): TelegramUpdateRead => {
  const parsed = telegramUpdate.safeParse(body);
  if (!parsed.success) {
    return { kind: "malformed" };
  }
  const { message, update_id: updateId } = parsed.data;
  const attachment = message ? readAttachment(message) : null;
  const text = (attachment ? message?.caption : message?.text)?.trim() ?? "";
  // Edited messages arrive as `edited_message`, so `message` is absent.
  if (
    !(message?.from && (text || attachment)) ||
    message.chat.type !== "private" ||
    message.from.is_bot
  ) {
    return { kind: "ignored" };
  }
  const { from } = message;

  return {
    kind: "message",
    message: {
      ...(attachment ? { attachment } : {}),
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
const callTelegram = async (
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
  const json = (await response.json().catch((error: unknown) => {
    log.warn({
      action: "chat.telegram.response_unreadable",
      method,
      ...parseError(error),
      httpStatus: response.status,
    });
    return null;
  })) as {
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
  download: async (ref, maxBytes) => {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("Telegram download unavailable");
    }
    try {
      const result = (await callTelegram(token, "getFile", {
        file_id: ref,
      })) as { file_path?: string; file_size?: number };
      if (!result.file_path || (result.file_size ?? 0) > maxBytes) {
        throw new Error("Telegram file unavailable or too large");
      }
      const response = await fetch(
        `https://api.telegram.org/file/bot${token}/${result.file_path}`,
        {
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (
        !response.ok ||
        Number(response.headers.get("content-length") ?? 0) > maxBytes ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new Error("Telegram file unavailable or too large");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          length += value.byteLength;
          if (length > maxBytes) {
            throw new Error("Telegram file too large");
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    } catch {
      // Fetch and Bot API errors can include credential-bearing URLs.
      throw new Error("Telegram receipt download failed or file too large");
    }
  },
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

    const body: unknown = await request.json().catch((error: unknown) => {
      log.warn({
        action: "chat.webhook.unreadable",
        channel: "telegram",
        ...parseError(error),
      });
      return null;
    });
    const update = readTelegramUpdate(body);
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
