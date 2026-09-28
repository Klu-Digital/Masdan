import type { Database } from "@masdan/db";
import { currency, exchangeRate } from "@masdan/db/schema/index";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";

/** ECB reference rates fetched via Frankfurter. */
export const FEED_SOURCE = "ecb" as const;

const responseSchema = z.object({
  base: z.literal("EUR"),
  date: z.iso.date(),
  rates: z.record(z.string(), z.number().positive().finite()),
});

export const refreshExchangeRates = async (
  db: Database,
  {
    fetch: fetcher = globalThis.fetch,
    url,
    now = new Date(),
  }: {
    fetch?: typeof fetch;
    url: string;
    now?: Date;
  }
): Promise<{ rateDate: string; stored: number }> => {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`FX feed returned HTTP ${response.status}`);
  }
  const payload = responseSchema.parse(await response.json());
  const codes = Object.keys(payload.rates).filter((code) => code !== "EUR");
  if (codes.length === 0) {
    return { rateDate: payload.date, stored: 0 };
  }
  const known = await db
    .select({ code: currency.code })
    .from(currency)
    .where(inArray(currency.code, codes));
  const rows = known.map(({ code }) => ({
    baseCurrency: "EUR",
    fetchedAt: now,
    quoteCurrency: code,
    rate: String(payload.rates[code]),
    rateDate: payload.date,
    source: FEED_SOURCE,
  }));
  if (rows.length) {
    await db
      .insert(exchangeRate)
      .values(rows)
      .onConflictDoUpdate({
        set: { fetchedAt: now, rate: sql`excluded.rate` },
        target: [
          exchangeRate.source,
          exchangeRate.baseCurrency,
          exchangeRate.quoteCurrency,
          exchangeRate.rateDate,
        ],
      });
  }
  return { rateDate: payload.date, stored: rows.length };
};
