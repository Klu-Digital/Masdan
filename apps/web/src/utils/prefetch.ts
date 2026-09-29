import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

// `never` errors: each builder types its own, and `retry` takes them as input.
type PrefetchOptions = FetchQueryOptions<unknown, never>;

/**
 * Starts a screen's reads from its route loader, so they run alongside the
 * household gate's instead of after it. Not awaited: navigation stays instant
 * and each section keeps its own skeleton and failure state.
 */
export const prefetch = (
  queryClient: QueryClient,
  queries: Record<string, PrefetchOptions>
): void => {
  for (const options of Object.values(queries)) {
    void queryClient.prefetchQuery(options);
  }
};
