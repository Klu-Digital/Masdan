import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { isoDate } from "../shared/dates";
import { positiveAmount } from "../shared/money";
import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
} from "./transfers.commands";
import { getTransfer } from "./transfers.queries";

const transferValues = z
  .object({
    destinationAccountId: z.uuid(),
    destinationAmount: positiveAmount,
    notes: z.string().trim().max(2000).nullable().optional(),
    sourceAccountId: z.uuid(),
    sourceAmount: positiveAmount,
    transactionDate: isoDate,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceAccountId === value.destinationAccountId) {
      context.addIssue({
        code: "custom",
        message: "Choose two different accounts",
        path: ["destinationAccountId"],
      });
    }
  });

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
