import { chatChannels } from "@masdan/db/schema/index";
import type { ChatChannel } from "@masdan/db/schema/index";

import { telegramChannel } from "./channels/telegram";
import type { ChatChannelAdapter } from "./chat.channel";

/**
 * Every channel chat entry can use. The mapped type is the point: a name in
 * `chatChannels` without an adapter here is a compile error, and the reverse.
 */
export const chatChannelAdapters: Record<ChatChannel, ChatChannelAdapter> = {
  telegram: telegramChannel,
};

export const isChatChannel = (value: string): value is ChatChannel =>
  (chatChannels as readonly string[]).includes(value);

/** Channels with credentials, in registry order. */
export const configuredChatChannels = (): ChatChannel[] =>
  chatChannels.filter((channel) => chatChannelAdapters[channel].isConfigured());
