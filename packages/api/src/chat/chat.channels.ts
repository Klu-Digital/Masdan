import { chatChannels } from "@masdan/db/schema/index";
import type { ChatChannel } from "@masdan/db/schema/index";

import { telegramChannel } from "./channels/telegram";
import type { ChatChannelAdapter } from "./chat.channel";

// Mapped type: a channel without an adapter is a compile error.
export const chatChannelAdapters: Record<ChatChannel, ChatChannelAdapter> = {
  telegram: telegramChannel,
};

export const isChatChannel = (value: string): value is ChatChannel =>
  (chatChannels as readonly string[]).includes(value);

/** Channels with credentials, in registry order. */
export const configuredChatChannels = (): ChatChannel[] =>
  chatChannels.filter((channel) => chatChannelAdapters[channel].isConfigured());
