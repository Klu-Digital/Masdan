import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

// `never` errors: each builder types its own, and `retry` takes them as input.
type PrefetchOptions = FetchQueryOptions<unknown, never>;

// Not awaited: navigation stays instant.
export const prefetch = (
  queryClient: QueryClient,
  queries: Record<string, PrefetchOptions>
): void => {
  for (const options of Object.values(queries)) {
    void queryClient.prefetchQuery(options);
  }
};
