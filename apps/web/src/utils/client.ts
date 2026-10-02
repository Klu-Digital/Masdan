import type { AppRouterClient } from "@masdan/api/routers/index";
import { env } from "@masdan/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";

import { getServerUrl } from "@/lib/server-url";

const link = new RPCLink({
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  // The server refuses RPC calls without its header (see apps/server/src/orpc.ts).
  plugins: [new SimpleCsrfProtectionLinkPlugin()],
  url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
});

// Screens go through `orpc` / `householdOrpc` in `./orpc`.
export const client: AppRouterClient = createORPCClient(link);
