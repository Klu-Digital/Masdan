import type { Database } from "@masdan/db";
import { DEFAULT_CATEGORIES } from "@masdan/db/reference/categories";
import {
  category,
  financialAccount,
  financialAccountInterest,
  interestCredit,
  organization,
} from "@masdan/db/schema/index";
import { log } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getAccountBalance } from "../accounts/balances";
import { householdToday } from "../reports/periods";
import { formatScaledAmount, signedScaledAmount } from "../shared/money";
import { createTransaction } from "../transactions/transactions.write";
import { addDays } from "./calendar";
import { resolveVersions } from "./catalog";
import { accrue } from "./engine";
import type { InterestPeriod, RateVersion } from "./engine";
import {
  dailyBalances,
  latest,
  loadAccountInterest,
  minorUnitsOf,
  periodStart,
} from "./interest.queries";

/**
 * Worker-side posting of estimated interest. No procedure ladder: apps/workers
 * runs it, and every credit goes through `createTransaction` like manual entry.
 */

/** Bounds one run's catch-up after downtime; the next sweep continues it. */
const MAX_CREDITS_PER_RUN = 62;

const INTEREST_CATEGORY = DEFAULT_CATEGORIES.find(
  ({ name }) => name === "Interest Income"
);

export interface PostingResult {
  /** Credits that got a transaction in this run. */
  posted: number;
  /** Credits recorded with nothing to post: they earned zero. */
  empty: number;
  /** Set when the account can no longer take a posting. */
  skippedReason: string | null;
}

const NOTHING: PostingResult = { empty: 0, posted: 0, skippedReason: null };

/** The household's "Interest Income" category, restored or created if needed. */
const interestCategory = async (
  db: Database,
  organizationId: string
): Promise<string> => {
  const name = INTEREST_CATEGORY?.name ?? "Interest Income";
  const [existing] = await db
    .select({ archivedAt: category.archivedAt, id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.type, "income"),
        sql`lower(${category.name}) = lower(${name})`
      )
    )
    .limit(1);
  if (existing) {
    if (existing.archivedAt) {
      await db
        .update(category)
        .set({ archivedAt: null })
        .where(eq(category.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db
    .insert(category)
    .values({
      color: INTEREST_CATEGORY?.color ?? "teal",
      icon: INTEREST_CATEGORY?.icon ?? "💰",
      name,
      organizationId,
      sortOrder: INTEREST_CATEGORY?.sortOrder ?? 120,
      type: "income",
    })
    // An expense category may already hold the name.
    .onConflictDoNothing()
    .returning({ id: category.id });
  if (!created) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An expense category is already named ${name}`,
    });
  }
  return created.id;
};

/** Where posting starts: after the last credit, else the period it was set up in. */
const firstDay = (
  versions: RateVersion[],
  setUpOn: string,
  lastPeriodEnd: string | null,
  bounds: (string | null)[],
  anchor: string | null
): string => {
  if (lastPeriodEnd !== null) {
    return addDays(lastPeriodEnd, 1);
  }
  const terms =
    versions.find(
      ({ effectiveFrom, effectiveTo }) =>
        (effectiveFrom === null || effectiveFrom <= setUpOn) &&
        (effectiveTo === null || setUpOn <= effectiveTo)
    )?.terms ?? versions[0]?.terms;
  // A monthly credit pays the whole month it was set up in; daily ones start
  // that day rather than backfilling the month.
  const start =
    !terms || terms.creditFrequency === "daily"
      ? setUpOn
      : periodStart(terms, setUpOn, anchor);
  return latest(start, ...bounds);
};

const creditNotes = (period: InterestPeriod, currency: string): string =>
  `Estimated interest, ${period.start} to ${period.end}: ${currency} ${formatScaledAmount(period.gross)} gross less ${currency} ${formatScaledAmount(period.tax)} withholding tax`;

interface CreditBatch {
  accountId: string;
  currency: string;
  organizationId: string;
  periods: (InterestPeriod & { creditDate: string })[];
}

/** Records each period, then posts the ones that earned anything. */
const postCredits = async (
  tx: Database,
  { accountId, currency, organizationId, periods }: CreditBatch
): Promise<PostingResult> => {
  const result = { ...NOTHING };
  const earning = periods.some((period) => period.net > 0n);
  let categoryId = "";
  try {
    categoryId = earning ? await interestCategory(tx, organizationId) : "";
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      throw error;
    }
    return { ...result, skippedReason: error.message };
  }
  for (const period of periods) {
    const [credit] = await tx
      .insert(interestCredit)
      .values({
        accountId,
        creditDate: period.creditDate,
        gross: formatScaledAmount(period.gross),
        net: formatScaledAmount(period.net),
        organizationId,
        periodEnd: period.end,
        periodStart: period.start,
        tax: formatScaledAmount(period.tax),
      })
      .onConflictDoNothing()
      .returning({ id: interestCredit.id });
    if (!credit) {
      continue;
    }
    if (period.net <= 0n) {
      result.empty += 1;
      continue;
    }
    const values = {
      accountId,
      amount: formatScaledAmount(period.net),
      categoryId,
      notes: creditNotes(period, currency),
      paidStatus: "paid" as const,
      splits: [],
      tagIds: [],
      transactionDate: period.creditDate,
    };
    try {
      // A savepoint, so a rejected posting leaves the credits before it.
      const created = await tx.transaction((savepoint) =>
        createTransaction(savepoint, organizationId, values)
      );
      await tx
        .update(interestCredit)
        .set({ transactionId: created?.id ?? null })
        .where(eq(interestCredit.id, credit.id));
      result.posted += 1;
    } catch (error) {
      if (!(error instanceof ORPCError)) {
        throw error;
      }
      // Retrying repeats the same refusal: stop at this credit and let the
      // next sweep try again once the household fixes it.
      await tx.delete(interestCredit).where(eq(interestCredit.id, credit.id));
      log.warn({
        accountId,
        action: "interest.post.skipped",
        creditDate: period.creditDate,
        reason: error.message,
      });
      return { ...result, skippedReason: error.message };
    }
  }
  return result;
};

/**
 * Posts each finished credit period of one account as income, dated on its
 * credit date. The config row lock serializes overlapping runs; the unique
 * (account, credit date) key is what makes a duplicate impossible without it.
 */
export const postAccountInterest = (
  db: Database,
  accountId: string,
  now: Date
): Promise<PostingResult> =>
  db.transaction(async (tx) => {
    const [config] = await tx
      .select()
      .from(financialAccountInterest)
      .where(eq(financialAccountInterest.accountId, accountId))
      .for("update")
      .limit(1);
    if (!config?.autoPost) {
      return NOTHING;
    }
    const { organizationId } = config;
    const [account] = await tx
      .select({
        archivedAt: financialAccount.archivedAt,
        currencyCode: financialAccount.currencyCode,
        openingBalanceDate: financialAccount.openingBalanceDate,
        timezone: organization.timezone,
      })
      .from(financialAccount)
      .innerJoin(
        organization,
        eq(organization.id, financialAccount.organizationId)
      )
      .where(eq(financialAccount.id, accountId))
      .limit(1);
    if (!account || account.archivedAt) {
      return NOTHING;
    }
    const loaded = await loadAccountInterest(tx, organizationId, accountId);
    if (!loaded) {
      return NOTHING;
    }

    const today = householdToday(account.timezone, now);
    const versions = resolveVersions(
      loaded.versions,
      loaded.schedules,
      loaded.term
    );
    const [last] = await tx
      .select({ periodEnd: interestCredit.periodEnd })
      .from(interestCredit)
      .where(eq(interestCredit.accountId, accountId))
      .orderBy(desc(interestCredit.periodEnd))
      .limit(1);
    const from = firstDay(
      versions,
      householdToday(account.timezone, config.createdAt),
      last?.periodEnd ?? null,
      [
        account.openingBalanceDate,
        config.startDate,
        loaded.versions[0]?.effectiveFrom ?? null,
      ],
      config.startDate
    );
    // Only days that are over: today's interest is posted tomorrow.
    if (from >= today) {
      return NOTHING;
    }

    const [balances, principal, minorUnits] = await Promise.all([
      dailyBalances(tx, organizationId, accountId, from, addDays(today, -1)),
      config.startDate === null
        ? null
        : getAccountBalance(tx, organizationId, accountId, config.startDate),
      minorUnitsOf(tx, account.currencyCode),
    ]);
    const periods = accrue({
      anchor: config.startDate,
      balanceOn: (date) => balances.get(date) ?? 0n,
      bonusEligible: config.bonusEligible,
      // Credits posted in this run are not in `balances` yet.
      compound: true,
      from,
      maturityDate: config.maturityDate,
      minorUnits,
      principal: principal === null ? null : signedScaledAmount(principal),
      to: today,
      versions,
    })
      .filter(
        (period): period is InterestPeriod & { creditDate: string } =>
          period.complete && period.creditDate !== null
      )
      .slice(0, MAX_CREDITS_PER_RUN);

    return postCredits(tx, {
      accountId,
      currency: account.currencyCode,
      organizationId,
      periods,
    });
  });

/** Accounts set to post interest automatically, on unarchived accounts. */
export const findAccountsToCredit = async (db: Database): Promise<string[]> => {
  const rows = await db
    .select({ accountId: financialAccountInterest.accountId })
    .from(financialAccountInterest)
    .innerJoin(
      financialAccount,
      and(
        eq(financialAccount.id, financialAccountInterest.accountId),
        eq(
          financialAccount.organizationId,
          financialAccountInterest.organizationId
        )
      )
    )
    .where(
      and(
        eq(financialAccountInterest.autoPost, true),
        isNull(financialAccount.archivedAt)
      )
    );
  return rows.map(({ accountId }) => accountId);
};
