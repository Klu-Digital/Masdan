import type { AppRouterClient } from "@k22i/api/routers/index";
import { env } from "@k22i/env/web";
import { toastManager } from "@k22i/ui/components/toast";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";

import { getServerUrl } from "@/lib/server-url";

/** Opt-out flag for the global error toast below. */
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { suppressErrorToast?: boolean };
  }
}

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Queries that render their own failure state opt out, or the visitor
        // is told the same thing twice.
        if (query.meta?.suppressErrorToast) {
          return;
        }
        toastManager.add({
          actionProps: {
            children: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
          title: `Error: ${error.message}`,
          type: "error",
        });
      },
    }),
  });

export const queryClient = createQueryClient();

export const link = new RPCLink({
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
  url: `${getServerUrl(env.VITE_SERVER_URL)}/rpc`,
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
