import type { RouterClient } from "@orpc/server";

import { currenciesRouter } from "../currencies/currencies.router";
import { featureFlagsRouter } from "../feature-flags/feature-flags.router";
import { filesRouter } from "../files/files.router";
import { householdsRouter } from "../households/households.router";
import { invitationsRouter } from "../invitations/invitations.router";
import { jobsRouter } from "../jobs/jobs.router";
import { protectedProcedure, publicProcedure } from "../procedures";
import { adminRouter } from "./admin";

/**
 * The tenant-scoped surface: everything here needs no organization, or runs on
 * `orgProcedure` and can filter on `organizationId`. `admin` is the one subtree
 * that spans tenants — see `./admin.ts`. Mount new routers through one of these
 * two barrels, never inline, so "what reads across organizations?" stays a
 * single file to read.
 */
export const appRouter = {
  admin: adminRouter,
  currencies: currenciesRouter,
  featureFlags: featureFlagsRouter,
  files: filesRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  households: householdsRouter,
  invitations: invitationsRouter,
  jobs: jobsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
