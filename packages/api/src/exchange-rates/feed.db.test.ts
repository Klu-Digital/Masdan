import { exchangeRate } from "@masdan/db/schema/index";
import { getTestDb } from "@masdan/testing";
import { eq } from "drizzle-orm";
import { expect, it } from "vite-plus/test";

import { refreshExchangeRates } from "./feed";

const url = "https://example.test/latest";

const fake = (usd: number): typeof fetch =>
  (() =>
    Promise.resolve(
      Response.json({
        base: "EUR",
        date: "2026-09-22",
        rates: { PHP: 60, USD: usd, XYZ: 100 },
      })
    )) as typeof fetch;

it("stores known feed pairs idempotently and updates changed values", async () => {
  const db = getTestDb();
  expect(await refreshExchangeRates(db, { fetch: fake(1.1), url })).toEqual({
    rateDate: "2026-09-22",
    stored: 2,
  });
  expect(await refreshExchangeRates(db, { fetch: fake(1.2), url })).toEqual({
    rateDate: "2026-09-22",
    stored: 2,
  });
  const rows = await db
    .select()
    .from(exchangeRate)
    .where(eq(exchangeRate.rateDate, "2026-09-22"));
  expect(rows).toHaveLength(2);
  expect(rows.some((row) => row.quoteCurrency === "XYZ")).toBe(false);
  expect(rows.find((row) => row.quoteCurrency === "USD")?.rate).toBe(
    "1.200000000000"
  );
});

it("throws on failed HTTP responses", async () => {
  await expect(
    refreshExchangeRates(getTestDb(), {
      fetch: (() =>
        Promise.resolve(
          new Response("offline", { status: 503 })
        )) as typeof fetch,
      url,
    })
  ).rejects.toThrow("503");
});
