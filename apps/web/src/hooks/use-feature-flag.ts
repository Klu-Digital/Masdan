import type { FeatureFlagName } from "@masdan/env/flags";
import { FEATURE_FLAG_TTL_MS } from "@masdan/env/flags";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

const useFeatureFlags = () =>
  useQuery({
    ...orpc.featureFlags.all.queryOptions(),
    refetchOnWindowFocus: true,
    staleTime: FEATURE_FLAG_TTL_MS,
  });

/** Fails closed: `false` while loading and `false` on error. */
export const useFeatureFlag = (name: FeatureFlagName): boolean =>
  useFeatureFlags().data?.[name] ?? false;
