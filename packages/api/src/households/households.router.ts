import { currency, organization } from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { notFound } from "../shared/errors";

// The handler checks `currency` so a bad code is BAD_REQUEST, not a 500.
const currencyCodeInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/u, "Use a three-letter currency code");

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
      throw notFound("Household");
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
        throw notFound("Household");
      }

      return { defaultCurrency: selected, timezone: household.timezone };
    }),
};
