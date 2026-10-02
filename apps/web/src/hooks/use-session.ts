import { useQuery } from "@tanstack/react-query";

import { sessionQueryOptions } from "@/lib/session";

// Reads the router guards' cache entry, not better-auth's `useSession()`.
export const useSession = () => useQuery(sessionQueryOptions());
