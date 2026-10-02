import type { Database } from "@masdan/db";
import type {
  InterestTerm,
  InterestTerms,
} from "@masdan/db/reference/interest";
import {
  currency,
  financialAccount,
  financialAccountInterest,
  financialAccountInterestRate,
  financialInstitution,
  interestCredit,
  interestProduct,
  interestRateSchedule,
} from "@masdan/db/schema/index";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getAccountBalance, getDailyMovements } from "../accounts/balances";
import { householdDate } from "../shared/household";
import { fixedAmountText, signedScaledAmount } from "../shared/money";
import { findOwned } from "../shared/ownership";
import { addDays, addMonths } from "./calendar";
import { resolveVersions, sameTerms, scheduleOn } from "./catalog";
import type { AccountRateVersion, ScheduleVersion } from "./catalog";
import { accrue, effectiveAnnualRate, totalOf } from "./engine";
import type { InterestPeriod, InterestTotals } from "./engine";

interface TermsRow {
  bonusAnnualRate: string | null;
  calculationBasis: InterestTerms["calculationBasis"] | null;
  conditionSummary: string | null;
  creditFrequency: InterestTerms["creditFrequency"] | null;
  dayCountBasis: InterestTerms["dayCountBasis"] | null;
  interestCapBalance: string | null;
  minimumBalance: string | null;
  tierMode: InterestTerms["tierMode"] | null;
  tiers: InterestTerms["tiers"] | null;
  withholdingTaxRate: string | null;
}

const termsOf = (row: TermsRow): InterestTerms | null =>
  row.tierMode &&
  row.tiers &&
  row.calculationBasis &&
  row.dayCountBasis &&
  row.creditFrequency &&
  row.withholdingTaxRate !== null
    ? {
        bonusAnnualRate: row.bonusAnnualRate,
        calculationBasis: row.calculationBasis,
        conditionSummary: row.conditionSummary,
        creditFrequency: row.creditFrequency,
        dayCountBasis: row.dayCountBasis,
        interestCapBalance: row.interestCapBalance,
        minimumBalance: row.minimumBalance,
        tierMode: row.tierMode,
        tiers: row.tiers,
        withholdingTaxRate: row.withholdingTaxRate,
      }
    : null;

const termOf = (row: {
  termCount: number | null;
  termUnit: InterestTerm["unit"] | null;
}): InterestTerm | null =>
  row.termCount !== null && row.termUnit !== null
    ? { count: row.termCount, unit: row.termUnit }
    : null;

export interface CatalogSchedule extends ScheduleVersion {
  id: string;
  sourceCheckedAt: string | null;
  sourceUrl: string | null;
}

const toSchedule = (
  row: typeof interestRateSchedule.$inferSelect
): CatalogSchedule | null => {
  const terms = termsOf(row);
  return terms
    ? {
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        id: row.id,
        sourceCheckedAt: row.sourceCheckedAt,
        sourceUrl: row.sourceUrl,
        term: termOf(row),
        terms,
      }
    : null;
};

export const productSchedules = async (
  db: Database,
  productId: string
): Promise<CatalogSchedule[]> => {
  const rows = await db
    .select()
    .from(interestRateSchedule)
    .where(eq(interestRateSchedule.productId, productId))
    .orderBy(sql`${interestRateSchedule.effectiveFrom} ASC NULLS FIRST`);
  return rows.flatMap((row) => toSchedule(row) ?? []);
};

/** Every shipped bank and product with its full rate history. */
export const interestCatalog = async (db: Database) => {
  const [institutions, products, schedules] = await Promise.all([
    db
      .select({
        aliases: financialInstitution.aliases,
        brandColor: financialInstitution.brandColor,
        countryCode: financialInstitution.countryCode,
        id: financialInstitution.id,
        institutionType: financialInstitution.institutionType,
        key: financialInstitution.key,
        logoKey: financialInstitution.logoKey,
        name: financialInstitution.name,
        shortName: financialInstitution.shortName,
        websiteUrl: financialInstitution.websiteUrl,
      })
      .from(financialInstitution)
      .orderBy(asc(financialInstitution.shortName)),
    db
      .select({
        aliases: interestProduct.aliases,
        channelInstitutionId: interestProduct.channelInstitutionId,
        currencyCode: interestProduct.currencyCode,
        id: interestProduct.id,
        institutionId: interestProduct.institutionId,
        key: interestProduct.key,
        name: interestProduct.name,
        notes: interestProduct.notes,
        productType: interestProduct.productType,
        sourceUrl: interestProduct.sourceUrl,
      })
      .from(interestProduct)
      .orderBy(asc(interestProduct.name)),
    db
      .select()
      .from(interestRateSchedule)
      .orderBy(sql`${interestRateSchedule.effectiveFrom} ASC NULLS FIRST`),
  ]);
  const byProduct = new Map<string, CatalogSchedule[]>();
  for (const row of schedules) {
    const schedule = toSchedule(row);
    if (schedule) {
      byProduct.set(row.productId, [
        ...(byProduct.get(row.productId) ?? []),
        schedule,
      ]);
    }
  }
  return {
    institutions,
    products: products.map((product) => ({
      ...product,
      schedules: byProduct.get(product.id) ?? [],
    })),
  };
};

/** The account's interest selection and rate history, or null if it earns none. */
export const loadAccountInterest = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  const [config] = await db
    .select()
    .from(financialAccountInterest)
    .where(
      and(
        eq(financialAccountInterest.organizationId, organizationId),
        eq(financialAccountInterest.accountId, accountId)
      )
    )
    .limit(1);
  if (!config) {
    return null;
  }
  const [rows, product, schedules] = await Promise.all([
    db
      .select()
      .from(financialAccountInterestRate)
      .where(
        and(
          eq(financialAccountInterestRate.organizationId, organizationId),
          eq(financialAccountInterestRate.accountId, accountId)
        )
      )
      .orderBy(asc(financialAccountInterestRate.effectiveFrom)),
    config.productId
      ? db
          .select({
            id: interestProduct.id,
            institutionName: financialInstitution.name,
            key: interestProduct.key,
            name: interestProduct.name,
            productType: interestProduct.productType,
          })
          .from(interestProduct)
          .innerJoin(
            financialInstitution,
            eq(financialInstitution.id, interestProduct.institutionId)
          )
          .where(eq(interestProduct.id, config.productId))
          .then(([row]) => row ?? null)
      : null,
    config.productId ? productSchedules(db, config.productId) : [],
  ]);
  const versions: (AccountRateVersion & { id: string })[] = rows.map((row) => ({
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    id: row.id,
    terms: row.followsPreset ? null : termsOf(row),
  }));
  const term = termOf(config);
  return { config, product, schedules, term, versions };
};

type LoadedInterest = NonNullable<
  Awaited<ReturnType<typeof loadAccountInterest>>
>;

/** A booked deposit whose terms are still the preset's reads as not customised. */
const customTermsOf = (loaded: LoadedInterest): InterestTerms | null => {
  const open = loaded.versions.at(-1);
  if (!open?.terms) {
    return null;
  }
  const booked =
    loaded.product?.productType === "time_deposit" &&
    loaded.config.startDate !== null
      ? scheduleOn(loaded.schedules, loaded.term, loaded.config.startDate)
      : null;
  return booked && sameTerms(booked.terms, open.terms) ? null : open.terms;
};

/** What the account form edits. */
export const accountInterestSummary = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  const loaded = await loadAccountInterest(db, organizationId, accountId);
  if (!loaded) {
    return null;
  }
  return {
    autoPost: loaded.config.autoPost,
    bonusEligible: loaded.config.bonusEligible,
    customTerms: customTermsOf(loaded),
    maturityDate: loaded.config.maturityDate,
    product: loaded.product,
    productId: loaded.config.productId,
    startDate: loaded.config.startDate,
    term: loaded.term,
  };
};

const money = (totals: InterestTotals) => ({
  gross: fixedAmountText(totals.gross),
  net: fixedAmountText(totals.net),
  tax: fixedAmountText(totals.tax),
});

const PROJECTION_MONTHS = 12;

/** Where the current credit period began, for "so far" figures. */
export const periodStart = (
  terms: InterestTerms,
  today: string,
  anchor: string | null
): string => {
  if (anchor !== null && terms.calculationBasis === "principal") {
    if (terms.creditFrequency !== "monthly") {
      return anchor;
    }
    let months = 0;
    while (addMonths(anchor, months + 1) <= today) {
      months += 1;
    }
    return addMonths(anchor, months);
  }
  return `${today.slice(0, 7)}-01`;
};

export const latest = (...dates: (string | null)[]): string => {
  let max = "";
  for (const date of dates) {
    if (date !== null && date > max) {
      max = date;
    }
  }
  return max;
};

/** End-of-day ledger balances for every day `[since, today]`. */
export const dailyBalances = async (
  db: Database,
  organizationId: string,
  accountId: string,
  since: string,
  today: string
): Promise<Map<string, bigint>> => {
  const [movements, opening] = await Promise.all([
    getDailyMovements(db, organizationId, accountId, since, today),
    getAccountBalance(db, organizationId, accountId, addDays(since, -1)),
  ]);
  const balances = new Map<string, bigint>();
  let running = signedScaledAmount(opening);
  for (let date = since; date <= today; date = addDays(date, 1)) {
    running += signedScaledAmount(movements.get(date) ?? "0");
    balances.set(date, running);
  }
  return balances;
};

interface Estimates {
  nextCredit: (ReturnType<typeof money> & { date: string }) | null;
  projection:
    | (ReturnType<typeof money> & { toMaturity: boolean; until: string })
    | null;
  toDate: (ReturnType<typeof money> & { since: string }) | null;
}

/** So far this period, the next credit, and the year (or term) ahead. */
const estimate = (
  base: Omit<
    Parameters<typeof accrue>[0],
    "balanceOn" | "compound" | "from" | "to"
  >,
  balances: Map<string, bigint>,
  since: string,
  today: string
): Estimates => {
  const todayBalance = balances.get(today) ?? 0n;
  const ledger = (date: string) => balances.get(date) ?? todayBalance;
  const soFar = accrue({
    ...base,
    balanceOn: ledger,
    compound: false,
    from: since,
    to: addDays(today, 1),
  });

  // The run continues at today's balance until the period in progress pays.
  const horizon = addMonths(today, PROJECTION_MONTHS);
  const next = accrue({
    ...base,
    balanceOn: ledger,
    compound: false,
    from: since,
    to: base.maturityDate ?? horizon,
  }).find(
    (period: InterestPeriod) =>
      period.complete &&
      period.creditDate !== null &&
      period.creditDate >= today
  );

  const until =
    base.maturityDate !== null && base.maturityDate < horizon
      ? base.maturityDate
      : horizon;
  const ahead = accrue({
    ...base,
    balanceOn: () => todayBalance,
    compound: true,
    from: addDays(today, 1),
    to: until,
  });
  return {
    nextCredit: next?.creditDate
      ? { ...money(totalOf([next])), date: next.creditDate }
      : null,
    projection: {
      ...money(totalOf(ahead)),
      toMaturity: until === base.maturityDate,
      until,
    },
    toDate: { ...money(totalOf(soFar)), since },
  };
};

export const minorUnitsOf = async (
  db: Database,
  code: string
): Promise<number> => {
  const [row] = await db
    .select({ minorUnits: currency.minorUnits })
    .from(currency)
    .where(eq(currency.code, code))
    .limit(1);
  return row?.minorUnits ?? 2;
};

export const interestProjection = async (
  db: Database,
  organizationId: string,
  accountId: string,
  now: Date = new Date()
) => {
  const account = await findOwned(
    db,
    financialAccount,
    { id: accountId, organizationId },
    "Financial account"
  );
  const loaded = await loadAccountInterest(db, organizationId, accountId);
  if (!loaded) {
    return null;
  }
  const { config } = loaded;
  const today = await householdDate(db, organizationId, now);
  const versions = resolveVersions(
    loaded.versions,
    loaded.schedules,
    loaded.term
  );
  const current =
    versions.find(
      ({ effectiveFrom, effectiveTo }) =>
        (effectiveFrom === null || effectiveFrom <= today) &&
        (effectiveTo === null || today <= effectiveTo)
    ) ?? null;
  const [balance, principal, [lastCredit]] = await Promise.all([
    getAccountBalance(db, organizationId, accountId, today),
    config.startDate === null
      ? null
      : getAccountBalance(db, organizationId, accountId, config.startDate),
    db
      .select({
        date: interestCredit.creditDate,
        net: interestCredit.net,
        transactionId: interestCredit.transactionId,
      })
      .from(interestCredit)
      .where(
        and(
          eq(interestCredit.organizationId, organizationId),
          eq(interestCredit.accountId, accountId)
        )
      )
      .orderBy(desc(interestCredit.creditDate))
      .limit(1),
  ]);
  const matured = config.maturityDate !== null && config.maturityDate <= today;
  const summary = {
    autoPost: config.autoPost,
    balance,
    bonusEligible: config.bonusEligible,
    followsPreset: loaded.versions.at(-1)?.terms === null,
    lastCredit: lastCredit ?? null,
    matured,
    maturityDate: config.maturityDate,
    principal,
    startDate: config.startDate,
    terms: current?.terms ?? null,
  };
  if (!current || matured) {
    return {
      ...summary,
      effectiveRate: null,
      nextCredit: null,
      projection: null,
      toDate: null,
    };
  }

  const rateBalance =
    current.terms.calculationBasis === "principal" && principal !== null
      ? principal
      : balance;
  const since = latest(
    periodStart(current.terms, today, config.startDate),
    account.openingBalanceDate,
    config.startDate
  );
  const balances = await dailyBalances(
    db,
    organizationId,
    accountId,
    since,
    today
  );
  return {
    ...summary,
    effectiveRate: fixedAmountText(
      effectiveAnnualRate(
        current.terms,
        signedScaledAmount(rateBalance),
        config.bonusEligible
      )
    ),
    ...estimate(
      {
        anchor: config.startDate,
        bonusEligible: config.bonusEligible,
        maturityDate: config.maturityDate,
        minorUnits: await minorUnitsOf(db, account.currencyCode),
        principal: principal === null ? null : signedScaledAmount(principal),
        versions,
      },
      balances,
      since,
      today
    ),
  };
};
