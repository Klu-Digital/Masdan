import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { transferValues } from "./schema";
import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from "./transfers.commands";
import { getTransfer } from "./transfers.queries";

export const transfersRouter = {
  create: orgMutationProcedure
    .use(requirePermission({ transaction: ["create"] }))
    .input(transferValues)
    .handler(({ context, input }) =>
      createTransfer(
        context.db,
        context.organizationId,
        input,
        context.session.user.id
      )
    ),
  delete: orgMutationProcedure
    .use(requirePermission({ transaction: ["archive"] }))
    .input(z.object({ transferId: z.uuid() }))
    .handler(({ context, input }) =>
      deleteTransfer(context.db, context.organizationId, input.transferId)
    ),
  get: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(z.object({ transferId: z.uuid() }))
    .handler(({ context, input }) =>
      getTransfer(context.db, context.organizationId, input.transferId)
    ),
  update: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transferValues.extend({ transferId: z.uuid() }))
    .handler(({ context, input }) =>
      updateTransfer(context.db, context.organizationId, input)
    ),
};
