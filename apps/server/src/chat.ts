import {
  chatChannelAdapters,
  isChatChannel,
} from "@masdan/api/chat/chat.channels";
import { receiveChatMessage } from "@masdan/api/chat/chat.receive";
import { db } from "@masdan/db";
import type { EvlogVariables } from "@masdan/observability/hono";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

/** A text message payload is a few KB on any channel; far larger is not a channel. */
const MAX_WEBHOOK_BYTES = 64 * 1024;

/**
 * The only routes meant to be exposed publicly, through a proxy that forwards
 * `/chat/<channel>/webhook` and nothing else. Mounted ahead of CORS and
 * session lookup: the caller is the channel, verified by its adapter alone.
 * All methods, since some channels verify a webhook with a GET handshake.
 */
export const mountChatWebhooks = (app: Hono<EvlogVariables>) => {
  app.all(
    "/chat/:channel/webhook",
    bodyLimit({ maxSize: MAX_WEBHOOK_BYTES }),
    (c) => {
      const channel = c.req.param("channel");
      if (!isChatChannel(channel)) {
        return c.json({}, 404);
      }
      return chatChannelAdapters[channel].handleWebhook(c.req.raw, (message) =>
        receiveChatMessage(db, channel, message)
      );
    }
  );
};
