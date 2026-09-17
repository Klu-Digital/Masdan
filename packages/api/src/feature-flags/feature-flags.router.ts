import { protectedProcedure } from "../procedures";
import { getFeatureFlags } from "./feature-flags.cache";

export const featureFlagsRouter = {
  /**
   * Readable by any signed-in user; writing is `admin.featureFlags.set` and
   * platform-admin only. Built by iterating the registry, never by returning
   * whatever rows the table holds.
   */
  all: protectedProcedure.handler(({ context }) => getFeatureFlags(context.db)),
};
