import { useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "@/lib/session";

/**
 * Reads the cache entry the router guards already resolved, rather than
 * better-auth's own `useSession()`.
 */
export const useSession = () => useQuery(sessionQueryOptions());
