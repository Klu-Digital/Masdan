import { currency } from "@masdan/db/schema/index";
import { asc, eq } from "drizzle-orm";

import { protectedProcedure } from "../procedures";

// Reference data: deliberately not tenant-scoped.
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
