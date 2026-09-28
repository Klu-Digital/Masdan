import type { Database } from "@masdan/db";
import { chatInboundMessage } from "@masdan/db/schema/index";
import type { ChatChannel } from "@masdan/db/schema/index";
import { env } from "@masdan/env/integrations";
import { log, parseError } from "@masdan/observability";
import { queue } from "@masdan/queue";
import { incrementWithTtl, redis } from "@masdan/redis";

import { isFeatureEnabled } from "../feature-flags/feature-flags.cache";
import { RECEIPT_CONTENT_TYPES } from "../transactions/receipt-entry";
import type { ChatReceipt, InboundChatMessage } from "./chat.channel";
import { readChatCommand } from "./chat.commands";
import { chatReplies } from "./chat.replies";

/** Matches quick entry's own limit, per chat account instead of per session. */
const RATE_LIMIT = { limit: 30, window: 60 };

/**
 * Keyed on the chat account, not the IP: every delivery comes from the
 * channel's own servers. Fails open like `rateLimit()`.
 */
const overRateLimit = async (
  channel: ChatChannel,
  senderId: string
): Promise<boolean> => {
  const client = redis.client();
  if (!client) {
    return false;
  }
  try {
    const count = await incrementWithTtl(
      client,
      `rl:chat:${channel}:${senderId}`,
      RATE_LIMIT.window
    );
    return count > RATE_LIMIT.limit;
  } catch (error) {
    log.warn({
      action: "chat.ratelimit.failed",
      channel,
      ...parseError(error),
    });
    return false;
  }
};

/**
 * The shared half of every webhook, after the adapter has verified the caller
 * and read the message. It deduplicates and enqueues; parsing and creating run
 * in apps/workers, because channels retry anything not answered promptly and
 * the AI parse alone can take 8s.
 */
export const receiveChatMessage = async (
  db: Database,
  channel: ChatChannel,
  message: InboundChatMessage
): Promise<ChatReceipt> => {
  if (!(await isFeatureEnabled(db, "FF__CHAT_ENTRY"))) {
    return { kind: "ignored" };
  }
  const { attachment } = message;
  if (
    attachment?.contentType &&
    !RECEIPT_CONTENT_TYPES.some((type) => type === attachment.contentType)
  ) {
    return { kind: "reply", text: chatReplies.receiptUnsupported };
  }
  if (
    attachment?.size !== null &&
    attachment?.size !== undefined &&
    attachment.size > env.STORAGE_MAX_UPLOAD_BYTES
  ) {
    return { kind: "reply", text: chatReplies.receiptTooLarge };
  }
  const command = attachment
    ? {
        caption: message.text || null,
        file: attachment,
        type: "receipt" as const,
      }
    : readChatCommand(message.text);
  if (command.type === "help") {
    return { kind: "reply", text: chatReplies.help };
  }
  if (await overRateLimit(channel, message.sender.id)) {
    return { kind: "reply", text: chatReplies.rateLimited };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [received] = await tx
        .insert(chatInboundMessage)
        .values({ channel, messageId: message.messageId })
        .onConflictDoNothing()
        .returning({ messageId: chatInboundMessage.messageId });
      if (!received) {
        return "duplicate";
      }
      // On the same transaction: a failed enqueue rolls the row back too.
      const jobId = await queue.enqueue(
        "chat.process",
        {
          channel,
          command,
          conversationId: message.conversationId,
          messageId: message.messageId,
          sender: message.sender,
        },
        { tx }
      );
      if (!jobId) {
        throw new Error("The queue accepted no job");
      }
      return "enqueued";
    });
    log.info({ action: `chat.message.${outcome}`, channel });
    return { kind: "accepted" };
  } catch (error) {
    // The queue fails open, so a message would otherwise vanish silently.
    log.error({ action: "chat.enqueue.failed", channel, ...parseError(error) });
    return { kind: "reply", text: chatReplies.queueUnavailable };
  }
};
