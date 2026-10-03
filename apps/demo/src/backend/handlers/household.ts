import { currencies as currencyReference } from "@masdan/db/reference/currencies";
import { FEATURE_FLAG_DEFAULTS } from "@masdan/env/flags";

import { interestCatalog } from "../catalog";
import type { Section } from "../router";
import { db } from "../store";
import { badRequest, find, newId } from "../util";

const currencyOf = (code: string) => {
  const currency = currencyReference.find((row) => row.code === code);
  if (!currency) {
    throw badRequest(`Unknown currency ${code}`);
  }
  return { ...currency };
};

const profile = () => ({
  defaultCurrency: currencyOf(db().household.defaultCurrency),
  timezone: db().household.timezone,
});

export const households: Section<"households"> = {
  profile,
  updateProfile: ({ defaultCurrency, timezone }) => {
    currencyOf(defaultCurrency);
    Object.assign(db().household, { defaultCurrency, timezone });
    return profile();
  },
};

export const currencies: Section<"currencies"> = {
  list: () => currencyReference.map((row) => ({ ...row })),
};

// Every flagged feature is AI or chat, which needs the server.
export const featureFlags: Section<"featureFlags"> = {
  all: () => ({ ...FEATURE_FLAG_DEFAULTS }),
};

export const interest: Section<"interest"> = {
  catalog: interestCatalog,
  projection: () => null,
};

export const exchangeRates: Section<"exchangeRates"> = {
  list: () =>
    db().exchangeRates.toSorted(
      (a, b) =>
        a.fromCurrency.localeCompare(b.fromCurrency) ||
        b.rateDate.localeCompare(a.rateDate)
    ),

  remove: ({ id }) => {
    find(db().exchangeRates, id, "Exchange rate");
    db().exchangeRates = db().exchangeRates.filter((row) => row.id !== id);
    return { id };
  },

  set: (input) => {
    const existing = db().exchangeRates.find(
      (row) =>
        row.fromCurrency === input.fromCurrency &&
        row.toCurrency === input.toCurrency &&
        row.rateDate === input.rateDate
    );
    const now = new Date();
    const rate = existing ?? {
      createdAt: now,
      createdByUserId: db().user.id,
      fromCurrency: input.fromCurrency,
      id: newId(),
      organizationId: db().household.id,
      rate: input.rate,
      rateDate: input.rateDate,
      toCurrency: input.toCurrency,
      updatedAt: now,
    };
    Object.assign(rate, { rate: input.rate, updatedAt: now });
    if (!existing) {
      db().exchangeRates.push(rate);
    }
    return rate;
  },
};
