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
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    /** Server -> bucket. Omit for real AWS S3. */
    S3_ENDPOINT: z.url().optional(),
    /** Required by MinIO; false for R2 and irrelevant for AWS. */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    /** Host baked into presigned URLs handed to clients. */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default("auto"),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(26_214_400),
    /** Trust forwarded client IP headers only behind a controlled proxy. */
    TRUST_PROXY_HEADERS: z.stringbool().default(false),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
