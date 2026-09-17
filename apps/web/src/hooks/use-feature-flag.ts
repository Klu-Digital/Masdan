import type { FeatureFlagName } from "@k22i/env/flags";
import { FEATURE_FLAG_TTL_MS } from "@k22i/env/flags";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/**
 * `featureFlags.all` is a `protectedProcedure`, so this belongs under
 * `src/routes/_auth/*`. Cached for the same window the server uses; holding it
 * longer only hides the staleness.
 */
export const useFeatureFlags = () =>
  useQuery({
    ...orpc.featureFlags.all.queryOptions(),
    refetchOnWindowFocus: true,
    staleTime: FEATURE_FLAG_TTL_MS,
  });

/** Fails closed: `false` while loading and `false` on error. */
export const useFeatureFlag = (name: FeatureFlagName): boolean =>
  useFeatureFlags().data?.[name] ?? false;
