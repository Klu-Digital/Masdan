import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";

const sessionQueryKey = ["session"] as const;

/**
 * The one session read in the app: resolved once by the root route into router
 * context, since three guards need the same answer on a single navigation.
 * `staleTime` keeps ordinary navigation off the network; the events that change
 * the answer invalidate explicitly.
 */
export const sessionQueryOptions = () =>
  queryOptions({
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      if (error) {
        throw new Error(error.message ?? "Could not load your session");
      }
      // Signed out is `null` data with no error: a real answer, not a failure.
      return data ?? null;
    },
    queryKey: sessionQueryKey,
    // A 401 is an answer, and retrying it just delays the redirect to /login.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

/**
 * `refetchType: "all"` is load-bearing. A plain `invalidateQueries` only
 * refetches queries with a mounted observer, and the root guard reads through
 * `ensureQueryData`, which serves stale data — together that is a sign-in that
 * appears to work and bounces back to /login. Await this before navigating
 * anywhere behind a guard.
 */
export const invalidateSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: sessionQueryKey,
    refetchType: "all",
  });
