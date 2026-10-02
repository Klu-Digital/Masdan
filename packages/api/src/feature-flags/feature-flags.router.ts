import { protectedProcedure } from "../procedures";
import { getFeatureFlags } from "./feature-flags.cache";

export const featureFlagsRouter = {
  all: protectedProcedure.handler(({ context }) => getFeatureFlags(context.db)),
};
