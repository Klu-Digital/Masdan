import { z } from "zod";

import { isoDate } from "../shared/dates";
import { positiveAmount } from "../shared/money";

export const transferValues = z
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
