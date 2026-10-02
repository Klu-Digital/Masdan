import type { AppRouterClient } from "@masdan/api/routers/index";
import { env } from "@masdan/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { getServerUrl } from "@/lib/server-url";

const link = new RPCLink({
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
});

// Screens go through `orpc` / `householdOrpc` in `./orpc`.
export const client: AppRouterClient = createORPCClient(link);
