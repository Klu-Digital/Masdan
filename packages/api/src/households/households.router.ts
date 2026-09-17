import { currency, organization } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";

/**
 * Shape only — a code that passes this still has to exist in `currency`, which
 * the handler checks so the answer is a BAD_REQUEST rather than a foreign-key
 * violation surfacing as a 500.
 */
const currencyCodeInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/u, "Use a three-letter currency code");

/**
 * No `timezone` table on purpose: tzdb ships several releases a year, and the
 * runtime that does the conversion is the only list that cannot fall behind it.
 */
const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));
const timezoneInput = z
  .string()
  .trim()
  .refine((value) => supportedTimezones.has(value), {
    message: "Use an IANA timezone",
  });

const profileFields = {
  defaultCurrency: {
    code: currency.code,
    minorUnits: currency.minorUnits,
    name: currency.name,
    symbol: currency.symbol,
    symbolNative: currency.symbolNative,
  },
  timezone: organization.timezone,
};

export const householdsRouter = {
  profile: orgProcedure.handler(async ({ context }) => {
    const [household] = await context.db
      .select(profileFields)
      .from(organization)
      .innerJoin(currency, eq(currency.code, organization.defaultCurrency))
      .where(eq(organization.id, context.organizationId))
      .limit(1);

    if (!household) {
      throw new ORPCError("NOT_FOUND", { message: "Household not found" });
    }

    return household;
  }),

  updateProfile: orgMutationProcedure
    .use(requirePermission({ organization: ["update"] }))
    .input(
      z.object({
        defaultCurrency: currencyCodeInput,
        timezone: timezoneInput,
      })
    )
    .handler(async ({ context, input }) => {
      const [selected] = await context.db
        .select(profileFields.defaultCurrency)
        .from(currency)
        .where(
          and(
            eq(currency.code, input.defaultCurrency),
            eq(currency.enabled, true)
          )
        )
        .limit(1);

      if (!selected) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Unknown currency ${input.defaultCurrency}`,
        });
      }

      const [household] = await context.db
        .update(organization)
        .set(input)
        .where(eq(organization.id, context.organizationId))
        .returning({ timezone: organization.timezone });

      if (!household) {
        throw new ORPCError("NOT_FOUND", { message: "Household not found" });
      }

      return { defaultCurrency: selected, timezone: household.timezone };
    }),
};
