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
    FX_RATES_URL: z
      .url()
      .default("https://api.frankfurter.dev/v1/latest?base=EUR"),
    WORKERS_PORT: z.coerce.number().int().positive().default(1901),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
