import {
  chatChannelAdapters,
  isChatChannel,
} from "@masdan/api/chat/chat.channels";
import { processChatMessage } from "@masdan/api/chat/chat.process";
import { db } from "@masdan/db";
import { env } from "@masdan/env/workers";
import { log, parseError } from "@masdan/observability";
import type { JobOf } from "@masdan/queue";

// Throws only before commit, so a retry is safe. The reply never throws.
export const handleChatProcess = async (
  job: JobOf<"chat.process">
): Promise<void> => {
  const { channel } = job.data;
  if (!isChatChannel(channel)) {
    // From an older or newer deploy's registry; nothing here can answer it.
    log.warn({
      action: "chat.process.unknown_channel",
      channel,
      jobId: job.id,
    });
    return;
  }
  const adapter = chatChannelAdapters[channel];
  if (!adapter.canSend()) {
    log.warn({ action: "chat.process.unconfigured", channel, jobId: job.id });
    return;
  }
  const reply = await processChatMessage(
    db,
    { ...job.data, channel },
    env.CHAT_APP_URL ?? null,
    adapter.download ?? null
  );
  if (!reply) {
    return;
  }
  try {
    await adapter.send(job.data.conversationId, reply);
  } catch (error) {
    log.error({
      action: "chat.reply.failed",
      channel,
      jobId: job.id,
      ...parseError(error),
    });
  }
};
