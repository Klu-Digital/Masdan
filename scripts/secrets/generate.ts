import { randomBytes } from "node:crypto";

export const generateSecret = (): string =>
  randomBytes(32).toString("base64url");
