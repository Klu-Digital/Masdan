import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  client: {
    /**
     * Where the SPA finds the API: an absolute origin, or a root-relative path
     * (`/` = this page's origin). The relative form is why one built bundle
     * works in every environment. Spell same-origin as `/`, never `""`:
     * `emptyStringAsUndefined` turns empty into `undefined`.
     */
    VITE_SERVER_URL: z.union([z.url(), z.string().regex(/^\/[^\s]*$/u)]),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  runtimeEnv: (
    import.meta as unknown as { env: Record<string, string | undefined> }
  ).env,
});
