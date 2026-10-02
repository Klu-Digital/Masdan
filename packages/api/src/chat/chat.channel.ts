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

export type ChatReceipt =
  | { kind: "accepted" }
  | { kind: "ignored" }
  | { kind: "reply"; text: string };

type ReceiveChatMessage = (message: InboundChatMessage) => Promise<ChatReceipt>;

export interface ChatChannelAdapter {
  download?: (ref: string, maxBytes: number) => Promise<Uint8Array>;
  /** Shown in Masdan, e.g. "Telegram". */
  label: string;
  // apps/workers holds the send credential but never the webhook secret.
  canSend: () => boolean;
  /** Without its credentials a channel is off: no webhook, not offered in settings. */
  isConfigured: () => boolean;
  /** 404 when unconfigured, 401 on failed verification, success otherwise. */
  handleWebhook: (
    request: Request,
    receive: ReceiveChatMessage
  ) => Promise<Response>;
  /** Replies from the worker. Plain text: nothing a user typed may become markup. */
  send: (conversationId: string, text: string) => Promise<void>;
}
