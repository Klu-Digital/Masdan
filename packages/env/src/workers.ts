import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { integrationVariables } from "./integrations";
import { sharedServerVariables } from "./shared-server";

/** Worker configuration intentionally excludes Better Auth and CORS settings. */
export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    ...sharedServerVariables,
    ...integrationVariables,
    WORKERS_PORT: z.coerce.number().int().positive().default(1901),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
