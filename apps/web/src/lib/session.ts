import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";

const sessionQueryKey = ["session"] as const;

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

// `refetchType: "all"` is load-bearing: without it sign-in bounces back to
// /login. Await this before navigating behind a guard.
export const invalidateSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: sessionQueryKey,
    refetchType: "all",
  });
