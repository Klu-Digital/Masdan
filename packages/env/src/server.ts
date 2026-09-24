import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { sharedServerVariables } from "./shared-server";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    ...sharedServerVariables,
    /** better-auth defaults its rate limiter to production-only. */
    AUTH_RATE_LIMIT_ENABLED: z.stringbool().optional(),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(10),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(1900),
    /** Trust forwarded client IP headers only behind a controlled proxy. */
    TRUST_PROXY_HEADERS: z.stringbool().default(false),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
