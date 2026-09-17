import { currency } from "@masdan/db/schema/index";
import { asc, eq } from "drizzle-orm";

import { protectedProcedure } from "../procedures";

/**
 * ISO 4217 reference data, deliberately not tenant-scoped: every household
 * picks from the same list, so this sits on `protectedProcedure` rather than
 * `orgProcedure` and carries no `organizationId` filter.
 */
export const currenciesRouter = {
  list: protectedProcedure.handler(({ context }) =>
    context.db
      .select({
        code: currency.code,
        minorUnits: currency.minorUnits,
        name: currency.name,
        symbol: currency.symbol,
        symbolNative: currency.symbolNative,
      })
      .from(currency)
      .where(eq(currency.enabled, true))
      .orderBy(asc(currency.code))
  ),
};
