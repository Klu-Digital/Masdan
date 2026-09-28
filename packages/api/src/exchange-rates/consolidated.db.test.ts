import {
  exchangeRate,
  financialAccount,
  householdExchangeRate,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { expect, it } from "vite-plus/test";

import { getNetWorth } from "../reports/reports.queries";
import { getConsolidatedNetWorth } from "./consolidated";

const now = new Date("2026-09-24T12:00:00Z");
const household = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  if (!session?.session.activeOrganizationId) {
    throw new Error("Missing household");
  }
  return {
    organizationId: session.session.activeOrganizationId,
    userId: session.user.id,
  };
};
const account = async (
  organizationId: string,
  balance: string,
  currencyCode: string,
  extra: Partial<typeof financialAccount.$inferInsert> = {}
) => {
  const [row] = await getTestDb()
    .insert(financialAccount)
    .values({
      accountClass: "asset",
      accountType: "bank",
      currencyCode,
      name: "Test account",
      openingBalance: balance,
      openingBalanceDate: "2026-01-01",
      organizationId,
      ...extra,
    })
    .returning({ id: financialAccount.id });
  if (!row) {
    throw new Error("Missing account");
  }
  return row.id;
};

it("sums rounded accounts, excludes missing and archived accounts, and keeps original report unchanged", async () => {
  const db = getTestDb();
  const { organizationId, userId } = await household();
  const php = await account(organizationId, "10", "PHP");
  const usd = await account(organizationId, "0.01", "USD");
  await account(organizationId, "0.01", "USD");
  await account(organizationId, "2", "EUR", {
    accountClass: "liability",
    accountType: "credit_card",
  });
  const jpy = await account(organizationId, "100", "JPY");
  await account(organizationId, "999", "PHP", { archivedAt: new Date() });
  await account(organizationId, "999", "PHP", { includeInNetWorth: false });
  const original = await getNetWorth(db, organizationId, now);
  await db.insert(householdExchangeRate).values({
    createdByUserId: userId,
    fromCurrency: "USD",
    organizationId,
    rate: "1.5",
    rateDate: "2026-09-16",
    toCurrency: "PHP",
  });
  await db.insert(exchangeRate).values({
    baseCurrency: "EUR",
    quoteCurrency: "PHP",
    rate: "60",
    rateDate: "2026-09-23",
    source: "ecb",
  });
  const result = await getConsolidatedNetWorth(db, organizationId, now);
  expect(result.status).toBe("partial");
  expect(result.accounts.map((row) => row.accountId)).toContain(php);
  expect(
    result.accounts.find((row) => row.accountId === usd)?.convertedBalance
  ).toBe("0.02");
  expect(
    result.accounts
      .filter((row) => row.currencyCode === "USD")
      .map((row) => row.convertedBalance)
  ).toEqual(["0.02", "0.02"]);
  expect(
    result.accounts.find((row) => row.accountId === jpy)?.convertedBalance
  ).toBeNull();
  expect(result.unconverted).toEqual([
    {
      accountCount: 1,
      assets: "100.000000",
      currencyCode: "JPY",
      liabilities: "0.000000",
    },
  ]);
  expect(result.rates.find((row) => row.currencyCode === "USD")?.status).toBe(
    "stale"
  );
  expect(result).toMatchObject({
    assets: "10.04",
    liabilities: "120.00",
    netWorth: "-109.96",
  });
  expect(await getNetWorth(db, organizationId, now)).toEqual(original);
});

it("handles negative liabilities without losing the assets-minus-liabilities invariant", async () => {
  const { organizationId } = await household();
  await account(organizationId, "3", "PHP");
  await account(organizationId, "-2", "PHP", {
    accountClass: "liability",
    accountType: "credit_card",
  });
  const report = await getConsolidatedNetWorth(
    getTestDb(),
    organizationId,
    now
  );
  expect(report).toMatchObject({
    assets: "3.00",
    liabilities: "-2.00",
    netWorth: "5.00",
  });
});

it("never uses another household's manual rate or accounts", async () => {
  const db = getTestDb();
  const owner = await household();
  const other = await household();
  await account(owner.organizationId, "4", "USD");
  await account(other.organizationId, "999", "USD");
  await db.insert(householdExchangeRate).values({
    fromCurrency: "USD",
    organizationId: other.organizationId,
    rate: "50",
    rateDate: "2026-09-24",
    toCurrency: "PHP",
  });
  const report = await getConsolidatedNetWorth(db, owner.organizationId, now);
  expect(report.accounts).toHaveLength(1);
  expect(report.accounts[0]?.convertedBalance).toBeNull();
  expect(report.status).toBe("partial");
});
