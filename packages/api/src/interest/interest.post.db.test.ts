import {
  category,
  financialAccountInterest,
  financialTransaction,
  interestCredit,
  interestProduct,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { transactionsRouter } from "../transactions/transactions.router";
import { findAccountsToCredit, postAccountInterest } from "./interest.post";
import { interestProjection } from "./interest.queries";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const productId = async (key: string): Promise<string> => {
  const [row] = await getTestDb()
    .select({ id: interestProduct.id })
    .from(interestProduct)
    .where(eq(interestProduct.key, key));
  return row?.id ?? "";
};

/** Noon in Manila on `date`. */
const noon = (date: string) => new Date(`${date}T04:00:00Z`);

/** An account whose interest was set up at noon on `setUpOn`. */
const savingsAccount = async ({
  autoPost = true,
  openingBalance,
  product,
  setUpOn,
}: {
  autoPost?: boolean;
  openingBalance: string;
  product: string;
  setUpOn: string;
}) => {
  const user = await signUpTestUser();
  const context = { context: await contextFor(user.headers) };
  const created = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      interest: {
        autoPost,
        bonusEligible: false,
        maturityDate: null,
        productId: await productId(product),
        startDate: null,
        term: null,
        terms: null,
      },
      liquidity: "liquid",
      name: "Savings",
      openingBalance,
      openingBalanceDate: "2026-10-01",
      ownerMemberIds: [],
    },
    context
  );
  await getTestDb()
    .update(financialAccountInterest)
    .set({ createdAt: noon(setUpOn) })
    .where(eq(financialAccountInterest.accountId, created.id));
  return { accountId: created.id, context };
};

const postingsOf = (accountId: string) =>
  getTestDb()
    .select({
      amount: financialTransaction.amount,
      archivedAt: financialTransaction.archivedAt,
      categoryName: category.name,
      date: financialTransaction.transactionDate,
      id: financialTransaction.id,
    })
    .from(financialTransaction)
    .innerJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(eq(financialTransaction.accountId, accountId))
    .orderBy(asc(financialTransaction.transactionDate));

describe("posting interest", () => {
  it("posts each finished day's net interest, compounding as it goes", async () => {
    const { accountId } = await savingsAccount({
      openingBalance: "1500000",
      product: "ph-maribank-savings",
      setUpOn: "2026-10-01",
    });

    const result = await postAccountInterest(
      getTestDb(),
      accountId,
      noon("2026-10-04")
    );

    // Today waits for tomorrow; day 2 earns on day 1's credit (140.42 gross).
    expect(result).toEqual({ empty: 0, posted: 3, skippedReason: null });
    expect(await postingsOf(accountId)).toMatchObject([
      {
        amount: "112.330000",
        categoryName: "Interest Income",
        date: "2026-10-01",
      },
      { amount: "112.340000", date: "2026-10-02" },
      { amount: "112.340000", date: "2026-10-03" },
    ]);
    const credits = await getTestDb()
      .select()
      .from(interestCredit)
      .where(eq(interestCredit.accountId, accountId))
      .orderBy(asc(interestCredit.creditDate));
    expect(credits[1]).toMatchObject({
      gross: "140.420000",
      net: "112.340000",
      tax: "28.080000",
    });
  });

  it("posts nothing twice, and never reposts an archived credit", async () => {
    const { accountId, context } = await savingsAccount({
      openingBalance: "1500000",
      product: "ph-maribank-savings",
      setUpOn: "2026-10-01",
    });
    await postAccountInterest(getTestDb(), accountId, noon("2026-10-03"));
    const [first] = await postingsOf(accountId);
    await call(
      transactionsRouter.archive,
      { transactionId: first?.id ?? "" },
      context
    );

    const again = await postAccountInterest(
      getTestDb(),
      accountId,
      noon("2026-10-03")
    );
    const later = await postAccountInterest(
      getTestDb(),
      accountId,
      noon("2026-10-04")
    );

    expect(again.posted).toBe(0);
    expect(later.posted).toBe(1);
    const live = await getTestDb()
      .select({ date: financialTransaction.transactionDate })
      .from(financialTransaction)
      .where(
        and(
          eq(financialTransaction.accountId, accountId),
          isNull(financialTransaction.archivedAt)
        )
      )
      .orderBy(asc(financialTransaction.transactionDate));
    expect(live.map(({ date }) => date)).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("credits a monthly account once the month is over, for the whole month", async () => {
    const { accountId } = await savingsAccount({
      openingBalance: "100000",
      product: "ph-salmon-save",
      setUpOn: "2026-10-15",
    });

    expect(
      await postAccountInterest(getTestDb(), accountId, noon("2026-10-31"))
    ).toMatchObject({ posted: 0 });
    await postAccountInterest(getTestDb(), accountId, noon("2026-11-02"));

    // 100,000 × 4% × 31/365 = 339.73 gross, 67.95 tax.
    expect(await postingsOf(accountId)).toMatchObject([
      { amount: "271.780000", date: "2026-10-31" },
    ]);
  });

  it("leaves accounts that don't post interest alone", async () => {
    const { accountId } = await savingsAccount({
      autoPost: false,
      openingBalance: "100000",
      product: "ph-salmon-save",
      setUpOn: "2026-10-01",
    });

    expect(await findAccountsToCredit(getTestDb())).not.toContain(accountId);
    expect(
      await postAccountInterest(getTestDb(), accountId, noon("2026-11-02"))
    ).toMatchObject({ posted: 0 });
    expect(await postingsOf(accountId)).toEqual([]);
  });

  it("shows the last posted credit on the projection", async () => {
    const { accountId } = await savingsAccount({
      openingBalance: "100000",
      product: "ph-salmon-save",
      setUpOn: "2026-10-01",
    });
    const db = getTestDb();
    await postAccountInterest(db, accountId, noon("2026-11-02"));
    const [credit] = await db
      .select({ organizationId: interestCredit.organizationId })
      .from(interestCredit)
      .where(eq(interestCredit.accountId, accountId));

    const projection = await interestProjection(
      db,
      credit?.organizationId ?? "",
      accountId,
      noon("2026-11-02")
    );

    expect(projection).toMatchObject({
      autoPost: true,
      lastCredit: { date: "2026-10-31", net: "271.780000" },
    });
    expect(await findAccountsToCredit(db)).toContain(accountId);
  });
});
