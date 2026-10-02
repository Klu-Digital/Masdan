import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  client: {
    // Spell same-origin as `/`, never `""`: empty becomes `undefined`.
    VITE_SERVER_URL: z.union([z.url(), z.string().regex(/^\/[^\s]*$/u)]),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  runtimeEnv: (
    import.meta as unknown as { env: Record<string, string | undefined> }
  ).env,
});
