import type { Database } from "@masdan/db";
import {
  category,
  currency,
  exchangeRate,
  financialAccount,
  financialTransaction,
  householdExchangeRate,
} from "@masdan/db/schema/index";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import {
  balanceCategory,
  balanceExpression,
  balancePostings,
} from "../accounts/balances";
import { householdToday } from "../reports/periods";
import { householdSettings } from "../shared/household";
import { AMOUNT_SCALE } from "../shared/money";
import { convertBalance, selectRate, sumMoney } from "./convert";
import { FEED_SOURCE } from "./feed";

export const getConsolidatedNetWorth = async (
  db: Database,
  organizationId: string,
  now: Date = new Date()
) => {
  const { defaultCurrency, timezone } = await householdSettings(
    db,
    organizationId
  );
  const today = householdToday(timezone, now);
  const [balances, manual, currencies] = await Promise.all([
    db
      .select({
        accountClass: financialAccount.accountClass,
        accountId: financialAccount.id,
        accountType: financialAccount.accountType,
        balance: balanceExpression,
        currencyCode: financialAccount.currencyCode,
      })
      .from(financialAccount)
      .leftJoin(financialTransaction, balancePostings())
      .leftJoin(category, balanceCategory)
      .where(
        and(
          eq(financialAccount.organizationId, organizationId),
          isNull(financialAccount.archivedAt),
          eq(financialAccount.includeInNetWorth, true)
        )
      )
      .groupBy(financialAccount.id),
    db
      .select()
      .from(householdExchangeRate)
      .where(
        and(
          eq(householdExchangeRate.organizationId, organizationId),
          lte(householdExchangeRate.rateDate, today)
        )
      ),
    db
      .select({ code: currency.code, minorUnits: currency.minorUnits })
      .from(currency)
      .where(eq(currency.code, defaultCurrency)),
  ]);
  const minorUnits = currencies[0]?.minorUnits;
  if (minorUnits === undefined) {
    throw new Error("Household default currency is missing");
  }
  const codes = [...new Set(balances.map((row) => row.currencyCode))].toSorted(
    (a, b) => {
      if (a === defaultCurrency) {
        return -1;
      }
      if (b === defaultCurrency) {
        return 1;
      }
      return a.localeCompare(b);
    }
  );
  const feed =
    codes.length === 0
      ? []
      : await db
          .select({
            fromCurrency: exchangeRate.baseCurrency,
            rate: exchangeRate.rate,
            rateDate: exchangeRate.rateDate,
            toCurrency: exchangeRate.quoteCurrency,
          })
          .from(exchangeRate)
          .where(
            and(
              eq(exchangeRate.source, FEED_SOURCE),
              lte(exchangeRate.rateDate, today),
              inArray(exchangeRate.quoteCurrency, [
                ...new Set([...codes, defaultCurrency]),
              ])
            )
          );
  const selected = codes.map((code) =>
    selectRate(code, defaultCurrency, today, manual, feed)
  );
  const rates = selected.map(({ ratio: _ratio, ...rate }) => rate);
  const byCurrency = new Map(selected.map((rate) => [rate.currencyCode, rate]));
  const accounts = balances.map((account) => {
    const ratio = byCurrency.get(account.currencyCode)?.ratio;
    return {
      ...account,
      convertedBalance: ratio
        ? convertBalance(account.balance, ratio, minorUnits)
        : null,
    };
  });
  const converted = accounts.filter(
    (account): account is typeof account & { convertedBalance: string } =>
      account.convertedBalance !== null
  );
  const assets = sumMoney(
    converted
      .filter((row) => row.accountClass === "asset")
      .map((row) => row.convertedBalance),
    minorUnits
  );
  const liabilities = sumMoney(
    converted
      .filter((row) => row.accountClass !== "asset")
      .map((row) => row.convertedBalance),
    minorUnits
  );
  const unconverted = codes
    .filter((code) => byCurrency.get(code)?.status === "missing")
    .map((code) => {
      const missing = accounts.filter((row) => row.currencyCode === code);
      return {
        accountCount: missing.length,
        assets: sumMoney(
          missing
            .filter((row) => row.accountClass === "asset")
            .map((row) => row.balance),
          AMOUNT_SCALE
        ),
        currencyCode: code,
        liabilities: sumMoney(
          missing
            .filter((row) => row.accountClass !== "asset")
            .map((row) => row.balance),
          AMOUNT_SCALE
        ),
      };
    });
  return {
    accounts,
    assets,
    defaultCurrency,
    liabilities,
    netWorth: sumMoney(
      [
        assets,
        liabilities.startsWith("-") ? liabilities.slice(1) : `-${liabilities}`,
      ],
      minorUnits
    ),
    rates,
    status: unconverted.length ? ("partial" as const) : ("complete" as const),
    today,
    unconverted,
  };
};
