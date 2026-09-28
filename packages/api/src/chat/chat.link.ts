import { createHash, randomInt } from "node:crypto";

import { normalizeLinkCode } from "./chat.commands";

/** Long enough to type from the settings screen, short enough to expire unused. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

// No 0/O or 1/I: the code is read off one screen and typed into another.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** 40 random bits, shown as `ABCD-EFGH`. */
export const generateLinkCode = (): string => {
  const characters = Array.from(
    { length: CODE_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("");
  return `${characters.slice(0, 4)}-${characters.slice(4)}`;
};

/** Only the hash is stored, so a database read cannot link someone’s chat account. */
export const hashLinkCode = (code: string): string =>
  createHash("sha256").update(normalizeLinkCode(code)).digest("hex");
