/**
 * The contract between chat entry and one messaging app. An adapter owns
 * everything channel-specific (verifying its webhook, reading its payloads,
 * answering in its format, sending replies) and nothing else. Linking, parsing,
 * authorization, deduplication and creation live in `chat.*` and are shared,
 * so a new channel is one adapter plus a line in `./chat.channels`.
 */

export interface InboundChatAttachment {
  ref: string;
  contentType: string | null;
  name: string | null;
  size: number | null;
}

/** One message from a person in a private conversation. */
export interface InboundChatMessage {
  attachment?: InboundChatAttachment;
  /** Where to reply: a chat id, a phone number, a DM channel id. */
  conversationId: string;
  /** The channel's id for this delivery; retries repeat it. */
  messageId: string;
  sender: {
    id: string;
    /** For display in Masdan, e.g. `@mj`. */
    name: string | null;
  };
  text: string;
}

/**
 * What the shared half decided. `reply` is for answers that need no worker,
 * like help or "try again"; the adapter delivers it however its channel can.
 */
export type ChatReceipt =
  | { kind: "accepted" }
  | { kind: "ignored" }
  | { kind: "reply"; text: string };

type ReceiveChatMessage = (message: InboundChatMessage) => Promise<ChatReceipt>;

export interface ChatChannelAdapter {
  download?: (ref: string, maxBytes: number) => Promise<Uint8Array>;
  /** Shown in Masdan, e.g. "Telegram". */
  label: string;
  /**
   * Whether `send` has what it needs. Narrower than `isConfigured`: apps/workers
   * holds the send credential but never the webhook secret.
   */
  canSend: () => boolean;
  /** Without its credentials a channel is off: no webhook, not offered in settings. */
  isConfigured: () => boolean;
  /**
   * The public webhook. Takes the raw request because channels verify
   * differently: a header token, an HMAC or a signature over the exact body,
   * a GET handshake. Must answer an unconfigured channel with 404, a caller
   * that fails verification with 401, and anything else the channel would
   * otherwise redeliver with success.
   */
  handleWebhook: (
    request: Request,
    receive: ReceiveChatMessage
  ) => Promise<Response>;
  /** Replies from the worker. Plain text: nothing a user typed may become markup. */
  send: (conversationId: string, text: string) => Promise<void>;
}
