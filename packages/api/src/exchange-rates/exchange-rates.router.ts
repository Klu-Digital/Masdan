import { currency, householdExchangeRate } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { householdToday } from "../reports/periods";
import { isoDate } from "../shared/dates";
import { notFound } from "../shared/errors";
import { householdSettings } from "../shared/household";

const setInput = z
  .object({
    fromCurrency: z.string().min(1),
    rate: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/u)
      .refine((value) => /[1-9]/u.test(value), "Rate must be positive"),
    rateDate: isoDate,
    toCurrency: z.string().min(1),
  })
  .refine((value) => value.fromCurrency !== value.toCurrency, {
    message: "Choose different currencies",
    path: ["toCurrency"],
  });

export const exchangeRatesRouter = {
  list: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .handler(({ context }) =>
      context.db
        .select()
        .from(householdExchangeRate)
        .where(eq(householdExchangeRate.organizationId, context.organizationId))
        .orderBy(
          desc(householdExchangeRate.rateDate),
          desc(householdExchangeRate.createdAt)
        )
    ),
  remove: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [removed] = await context.db
        .delete(householdExchangeRate)
        .where(
          and(
            eq(householdExchangeRate.organizationId, context.organizationId),
            eq(householdExchangeRate.id, input.id)
          )
        )
        .returning({ id: householdExchangeRate.id });
      if (!removed) {
        throw notFound("Exchange rate");
      }
      return removed;
    }),
  set: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(setInput)
    .handler(async ({ context, input }) => {
      const { defaultCurrency, timezone } = await householdSettings(
        context.db,
        context.organizationId
      );
      if (
        input.fromCurrency !== defaultCurrency &&
        input.toCurrency !== defaultCurrency
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "One side must be the household default currency",
        });
      }
      if (input.rateDate > householdToday(timezone, new Date())) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Rate date cannot be in the future",
        });
      }
      const enabled = await context.db
        .select({ code: currency.code })
        .from(currency)
        .where(
          and(
            inArray(currency.code, [input.fromCurrency, input.toCurrency]),
            eq(currency.enabled, true)
          )
        );
      if (enabled.length !== 2) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Choose enabled currencies",
        });
      }
      const [row] = await context.db
        .insert(householdExchangeRate)
        .values({
          ...input,
          createdByUserId: context.session.user.id,
          organizationId: context.organizationId,
        })
        .onConflictDoUpdate({
          set: { rate: input.rate, updatedAt: new Date() },
          target: [
            householdExchangeRate.organizationId,
            householdExchangeRate.fromCurrency,
            householdExchangeRate.toCurrency,
            householdExchangeRate.rateDate,
          ],
        })
        .returning();
      return row;
    }),
};
