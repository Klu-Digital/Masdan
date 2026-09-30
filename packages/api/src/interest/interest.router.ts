import { z } from "zod";

import {
  orgProcedure,
  protectedProcedure,
  requirePermission,
} from "../procedures";
import { interestCatalog, interestProjection } from "./interest.queries";

export const interestRouter = {
  // Shipped reference data, like currencies: the same for every household.
  catalog: protectedProcedure.handler(({ context }) =>
    interestCatalog(context.db)
  ),

  projection: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(z.object({ accountId: z.uuid() }))
    .handler(({ context, input }) =>
      interestProjection(context.db, context.organizationId, input.accountId)
    ),
};
