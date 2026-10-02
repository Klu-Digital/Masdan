import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { sharedServerVariables } from "./shared-server";

// Read by workers too, so not in `./server`. Unset turns a feature off.
export const integrationVariables = {
  /** Tokens each household may spend on AI per UTC day, all features together. 0 turns AI off. */
  AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(500_000),
  /** Upstream provider key; omit when the gateway supplies its own (BYOK). */
  AI_PROVIDER_API_KEY: z.string().min(1).optional(),
  /** `provider/model` for Ask Masdan. Unset turns the feature's AI off. */
  ASK_MASDAN_AI_MODEL: z.string().min(1).optional(),
  /** `provider/model` for category suggestions. Unset turns their AI off. */
  CATEGORIZE_AI_MODEL: z.string().min(1).optional(),
  /** Web app origin for chat replies' "finish it in Masdan" links. Unset drops the link. */
  CHAT_APP_URL: z.url().optional(),
  /** Sent as `cf-aig-authorization`; required by an authenticated gateway. */
  CLOUDFLARE_AI_GATEWAY_TOKEN: z.string().min(1).optional(),
  /** Cloudflare AI Gateway's OpenAI-compatible base URL, ending in `/compat`. */
  CLOUDFLARE_AI_GATEWAY_URL: z.url().optional(),
  /** `provider/model` for quick transaction entry. Unset turns the AI parse off. */
  QUICK_TRANSACTION_AI_MODEL: z.string().min(1).optional(),
  /** Vision-capable `provider/model` for receipts. Unset disables receipt AI. */
  RECEIPT_AI_MODEL: z.string().min(1).optional(),
  /** From @BotFather. Unset, with or without the secret, disables the bot. */
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  /** Telegram's `secret_token` alphabet and length, or `setWebhook` refuses it. */
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[\w-]{16,256}$/u)
    .optional(),
};

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: { ...sharedServerVariables, ...integrationVariables },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
