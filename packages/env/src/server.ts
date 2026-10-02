import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { integrationVariables } from "./integrations";
import { sharedServerVariables } from "./shared-server";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    ...sharedServerVariables,
    ...integrationVariables,
    /** Open self-service sign-up. Off: only the first account and invite-link holders. */
    ALLOW_SIGNUP: z.stringbool().default(false),
    /** better-auth defaults its rate limiter to production-only. */
    AUTH_RATE_LIMIT_ENABLED: z.stringbool().optional(),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(10),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(1900),
    /** Proxies we run in front of the server; 0 trusts no forwarded header. */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
