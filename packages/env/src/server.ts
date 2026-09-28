import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { sharedServerVariables } from "./shared-server";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    ...sharedServerVariables,
    /** Upstream provider key; omit when the gateway supplies its own (BYOK). */
    AI_PROVIDER_API_KEY: z.string().min(1).optional(),
    /** `provider/model` for Ask Masdan. Unset turns the feature's AI off. */
    ASK_MASDAN_AI_MODEL: z.string().min(1).optional(),
    /** better-auth defaults its rate limiter to production-only. */
    AUTH_RATE_LIMIT_ENABLED: z.stringbool().optional(),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(10),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    /** Sent as `cf-aig-authorization`; required by an authenticated gateway. */
    CLOUDFLARE_AI_GATEWAY_TOKEN: z.string().min(1).optional(),
    /** Cloudflare AI Gateway's OpenAI-compatible base URL, ending in `/compat`. */
    CLOUDFLARE_AI_GATEWAY_URL: z.url().optional(),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(1900),
    /** `provider/model` for quick transaction entry. Unset turns the AI parse off. */
    QUICK_TRANSACTION_AI_MODEL: z.string().min(1).optional(),
    /** Trust forwarded client IP headers only behind a controlled proxy. */
    TRUST_PROXY_HEADERS: z.stringbool().default(false),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
