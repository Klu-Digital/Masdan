import type { AppRouterClient } from "@masdan/api/routers/index";
import { toastManager } from "@masdan/ui/components/toast";
import { ORPCError, isDefinedError } from "@orpc/client";
import type {
  InferClientErrorUnion,
  InferClientInputs,
  InferClientOutputs,
} from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { client } from "@/utils/client";

/** Opt-outs for the global error toasts below. */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { suppressErrorToast?: boolean };
    queryMeta: { suppressErrorToast?: boolean };
  }
}

export type RouterInputs = InferClientInputs<AppRouterClient>;
export type RouterOutputs = InferClientOutputs<AppRouterClient>;
/** Every error a procedure can answer; the defined ones carry typed `data`. */
type RouterError = InferClientErrorUnion<AppRouterClient>;

const STALE_TIME_MS = 30_000;
const MAX_RETRIES = 2;
const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

// Only defined errors carry messages written for people.
export const errorMessage = (error: unknown): string => {
  // `isDefinedError` checks at runtime; the cast only lends it the types.
  const routerError = error as RouterError;
  if (isDefinedError(routerError)) {
    if (routerError.code === "TOO_MANY_REQUESTS") {
      return `Too many attempts. Try again in ${routerError.data.retryAfter} seconds.`;
    }
    return routerError.message;
  }
  if (error instanceof ORPCError) {
    return GENERIC_ERROR;
  }
  // `fetch` rejects with a TypeError when the server is unreachable.
  if (error instanceof TypeError) {
    return "Can’t reach Masdan. Check your connection.";
  }
  // Thrown by this app's own code (uploads, better-auth wrappers).
  if (error instanceof Error) {
    return error.message;
  }
  return GENERIC_ERROR;
};

export type FailureKind =
  | "forbidden"
  | "not_found"
  | "unexpected"
  | "unreachable";

/** Which screen a failed load deserves; decided from the oRPC error code. */
export const failureKind = (error: unknown): FailureKind => {
  if (error instanceof ORPCError) {
    if (error.code === "FORBIDDEN") {
      return "forbidden";
    }
    return error.code === "NOT_FOUND" ? "not_found" : "unexpected";
  }
  // `fetch` rejects with a TypeError when the server is unreachable.
  return error instanceof TypeError ? "unreachable" : "unexpected";
};

// Only a missing record becomes `null`; a 403 still reaches the error page.
export const orNullIfMissing = async <T>(
  load: Promise<T>
): Promise<T | null> => {
  try {
    return await load;
  } catch (error) {
    if (failureKind(error) === "not_found") {
      return null;
    }
    throw error;
  }
};

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // A defined error (403, 404, a conflict) is an answer; asking again
        // only delays it.
        retry: (failureCount, error) =>
          !isDefinedError(error) && failureCount < MAX_RETRIES,
        staleTime: STALE_TIME_MS,
      },
    },
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        // Mutations that show the failure inline opt out.
        if (mutation.meta?.suppressErrorToast) {
          return;
        }
        toastManager.add({ title: errorMessage(error), type: "error" });
      },
    }),
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
          title: errorMessage(error),
          type: "error",
        });
      },
    }),
  });

export const queryClient = createQueryClient();

/** Utils for data that belongs to no household: admin, reference data, invites. */
export const orpc = createTanstackQueryUtils(client);

type AppRouterUtils = RouterUtils<AppRouterClient>;

/** Where a household's queries live in the cache; every key starts with it. */
export const householdPath = (activeOrganizationId: string | null) => [
  "household",
  activeOrganizationId ?? "",
];

const householdUtils = new Map<string | null, AppRouterUtils>();

// `null` builds keys no enabled query should use; gate those on `enabled`.
export const householdOrpc = (
  activeOrganizationId: string | null
): AppRouterUtils => {
  const cached = householdUtils.get(activeOrganizationId);
  if (cached) {
    return cached;
  }
  const utils = createTanstackQueryUtils(client, {
    path: householdPath(activeOrganizationId),
  });
  householdUtils.set(activeOrganizationId, utils);
  return utils;
};
