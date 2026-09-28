/**
 * What a chat message asks for. Channel-neutral: `/link CODE` is typed text on
 * WhatsApp and a menu command on Telegram, and reads the same either way.
 */
import type { InboundChatAttachment } from "./chat.channel";

export type ChatCommand =
  | { type: "entry"; text: string }
  | { type: "help" }
  | { type: "receipt"; caption: string | null; file: InboundChatAttachment }
  | { code: string; type: "link" };

// `/link@MasdanBot CODE` is how Telegram sends a command tapped from its menu.
const COMMAND = /^\/(?<name>[a-z_]+)(?:@\w+)?(?:\s+(?<args>[\s\S]*))?$/iu;

/** Well past a real code; the job payload refuses anything longer. */
const MAX_CODE_LENGTH = 64;

/** Codes are shown as `ABCD-EFGH`; people retype them with or without the dash. */
export const normalizeLinkCode = (code: string): string =>
  code.replaceAll(/[\s-]/gu, "").toUpperCase();

export const readChatCommand = (text: string): ChatCommand => {
  const command = COMMAND.exec(text)?.groups;
  if (!command) {
    return { text, type: "entry" };
  }
  const code = normalizeLinkCode(command.args ?? "").slice(0, MAX_CODE_LENGTH);
  return command.name?.toLowerCase() === "link" && code
    ? { code, type: "link" }
    : { type: "help" };
};
