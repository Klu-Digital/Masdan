import type { Database } from "@masdan/db";
import type { InterestTerms } from "@masdan/db/reference/interest";
import {
  financialAccountInterest,
  financialAccountInterestRate,
  interestProduct,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import { addDays } from "./calendar";
import { sameTerm, sameTerms, scheduleOn } from "./catalog";
import { maturityFor } from "./engine";
import { loadAccountInterest, productSchedules } from "./interest.queries";
import { INTEREST_ACCOUNT_TYPES } from "./schema";
import type { AccountInterestValues } from "./schema";

interface InterestAccount {
  accountType: string;
  currencyCode: string;
  id: string;
  openingBalanceDate: string;
}

const badRequest = (message: string) =>
  new ORPCError("BAD_REQUEST", { message });

const termsColumns = (terms: InterestTerms | null) =>
  terms
    ? { ...terms, followsPreset: false }
    : {
        bonusAnnualRate: null,
        calculationBasis: null,
        conditionSummary: null,
        creditFrequency: null,
        dayCountBasis: null,
        followsPreset: true,
        interestCapBalance: null,
        minimumBalance: null,
        tierMode: null,
        tiers: null,
        withholdingTaxRate: null,
      };

/** The terms the account keeps itself, or `null` to follow the product. */
const ownTerms = async (
  db: Database,
  input: AccountInterestValues,
  product: { id: string; productType: string } | null,
  startDate: string
): Promise<InterestTerms | null> => {
  if (input.terms) {
    return input.terms;
  }
  if (!product) {
    throw badRequest("Choose a preset or enter a rate");
  }
  const schedules = await productSchedules(db, product.id);
  if (schedules.length === 0) {
    throw badRequest("There is no preset rate for this product. Enter yours.");
  }
  if (product.productType !== "time_deposit") {
    return null;
  }
  // A placement keeps the rate it was booked at, whatever the bank offers later.
  const booked = scheduleOn(schedules, input.term, startDate);
  if (!booked) {
    throw badRequest("Choose one of the product's tenors");
  }
  return booked.terms;
};

const chosenProduct = async (
  db: Database,
  productId: string | null,
  account: InterestAccount
) => {
  if (productId === null) {
    return null;
  }
  const [product] = await db
    .select({
      currencyCode: interestProduct.currencyCode,
      id: interestProduct.id,
      name: interestProduct.name,
      productType: interestProduct.productType,
    })
    .from(interestProduct)
    .where(eq(interestProduct.id, productId))
    .limit(1);
  if (!product) {
    throw badRequest("Choose a product from the list");
  }
  if (product.currencyCode !== account.currencyCode) {
    throw badRequest(
      `${product.name} earns interest in ${product.currencyCode}, not ${account.currencyCode}`
    );
  }
  return product;
};

/** A deposit starts on its opening date unless told otherwise. */
const placementOf = (
  input: AccountInterestValues,
  isDeposit: boolean,
  account: InterestAccount
) => {
  const startDate =
    input.startDate ?? (isDeposit ? account.openingBalanceDate : null);
  const maturityDate =
    input.maturityDate ??
    (startDate !== null && input.term !== null
      ? maturityFor(startDate, input.term)
      : null);
  if (
    startDate !== null &&
    maturityDate !== null &&
    maturityDate <= startDate
  ) {
    throw badRequest("Maturity comes after the placement date");
  }
  return { maturityDate, startDate };
};

type LoadedInterest = NonNullable<
  Awaited<ReturnType<typeof loadAccountInterest>>
>;

/** Same deposit, new rate: close the open version at yesterday. */
const appendVersion = async (
  db: Database,
  organizationId: string,
  existing: LoadedInterest,
  terms: InterestTerms | null,
  today: string
): Promise<void> => {
  const open = existing.versions.at(-1);
  if (open && open.effectiveTo === null && sameTerms(open.terms, terms)) {
    return;
  }
  // Nothing has accrued under a version that starts today: replace it.
  if (open && open.effectiveFrom >= today) {
    await db
      .update(financialAccountInterestRate)
      .set({ ...termsColumns(terms), effectiveTo: null })
      .where(eq(financialAccountInterestRate.id, open.id));
    return;
  }
  if (open) {
    await db
      .update(financialAccountInterestRate)
      .set({ effectiveTo: addDays(today, -1) })
      .where(
        and(
          eq(financialAccountInterestRate.id, open.id),
          eq(financialAccountInterestRate.organizationId, organizationId)
        )
      );
  }
  await db.insert(financialAccountInterestRate).values({
    ...termsColumns(terms),
    accountId: existing.config.accountId,
    effectiveFrom: today,
    organizationId,
  });
};

const removeInterest = async (
  db: Database,
  existing: LoadedInterest | null
): Promise<void> => {
  if (existing) {
    await db
      .delete(financialAccountInterest)
      .where(eq(financialAccountInterest.id, existing.config.id));
  }
};

/**
 * Sets, changes or removes (`null`) an account's interest. A change to the
 * rate from today closes the open version instead of rewriting it, so what
 * was estimated for past days stays as it was; a different product, tenor or
 * placement date is a different deposit and starts its history over.
 */
export const saveAccountInterest = async (
  db: Database,
  organizationId: string,
  account: InterestAccount,
  input: AccountInterestValues | null,
  today: string
): Promise<void> => {
  const existing = await loadAccountInterest(db, organizationId, account.id);
  if (input === null) {
    await removeInterest(db, existing);
    return;
  }
  if (
    !(INTEREST_ACCOUNT_TYPES as readonly string[]).includes(account.accountType)
  ) {
    throw badRequest(
      "Only bank, e-wallet and investment accounts earn interest"
    );
  }

  const product = await chosenProduct(db, input.productId, account);
  const { maturityDate, startDate } = placementOf(
    input,
    product?.productType === "time_deposit",
    account
  );
  const terms = await ownTerms(
    db,
    input,
    product,
    startDate ?? account.openingBalanceDate
  );
  if (terms?.creditFrequency === "maturity" && maturityDate === null) {
    throw badRequest("Set a maturity date for interest paid at maturity");
  }

  const selection = {
    autoPost: input.autoPost,
    bonusEligible: input.bonusEligible,
    maturityDate,
    productId: product?.id ?? null,
    startDate,
    termCount: input.term?.count ?? null,
    termUnit: input.term?.unit ?? null,
  };
  if (
    existing &&
    existing.config.productId === selection.productId &&
    existing.config.startDate === startDate &&
    sameTerm(existing.term, input.term)
  ) {
    await db
      .update(financialAccountInterest)
      .set(selection)
      .where(eq(financialAccountInterest.id, existing.config.id));
    await appendVersion(db, organizationId, existing, terms, today);
    return;
  }

  await removeInterest(db, existing);
  await db
    .insert(financialAccountInterest)
    .values({ ...selection, accountId: account.id, organizationId });
  await db.insert(financialAccountInterestRate).values({
    ...termsColumns(terms),
    accountId: account.id,
    effectiveFrom: startDate ?? account.openingBalanceDate,
    organizationId,
  });
};
