import { seedInterestCatalog } from "@masdan/db/reference/seed-interest-catalog";
import {
  financialAccountInterestRate,
  financialInstitution,
  financialTransaction,
  interestProduct,
  interestRateSchedule,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { saveAccountInterest } from "./interest.commands";
import { interestProjection } from "./interest.queries";
import { interestRouter } from "./interest.router";
import type { AccountInterestValues } from "./schema";

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const household = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  return {
    context: { context: await contextFor(user.headers) },
    organizationId: session?.session.activeOrganizationId ?? "",
  };
};

const productId = async (key: string): Promise<string> => {
  const [row] = await getTestDb()
    .select({ id: interestProduct.id })
    .from(interestProduct)
    .where(eq(interestProduct.key, key));
  if (!row) {
    throw new Error(`Missing preset ${key}`);
  }
  return row.id;
};

const interest = (
  values: Partial<AccountInterestValues>
): AccountInterestValues => ({
  autoPost: true,
  bonusEligible: false,
  maturityDate: null,
  productId: null,
  startDate: null,
  term: null,
  terms: null,
  ...values,
});

const bank = {
  accountClass: "asset" as const,
  accountType: "bank" as const,
  liquidity: "liquid" as const,
  openingBalance: "1500000",
  openingBalanceDate: "2026-10-01",
  ownerMemberIds: [],
};

// Noon in Manila on 10 Oct 2026.
const OCT_10 = new Date("2026-10-10T04:00:00Z");

const customTerms = {
  bonusAnnualRate: null,
  calculationBasis: "eod" as const,
  conditionSummary: null,
  creditFrequency: "monthly" as const,
  dayCountBasis: "365" as const,
  interestCapBalance: null,
  minimumBalance: null,
  tierMode: "marginal" as const,
  tiers: [{ annualRate: "3.65", minBalance: "0" }],
  withholdingTaxRate: "20",
};

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.code : error;
  }
  return "resolved";
};

describe("interest catalog", () => {
  it("ships presets by stable key, and reseeding changes nothing", async () => {
    const db = getTestDb();
    const before = await db.select().from(interestRateSchedule);

    await seedInterestCatalog(db);

    const after = await db.select().from(interestRateSchedule);
    expect(after).toEqual(before);
    const { context } = await household();
    const catalog = await call(interestRouter.catalog, undefined, context);
    const mari = catalog.products.find(
      ({ key }) => key === "ph-maribank-savings"
    );
    expect(mari?.schedules).toEqual([
      expect.objectContaining({
        effectiveFrom: null,
        term: null,
        terms: expect.objectContaining({
          tierMode: "marginal",
          tiers: [
            { annualRate: "3.25", minBalance: "0" },
            { annualRate: "3.75", minBalance: "1000000" },
          ],
        }),
      }),
    ]);
    const gsave = catalog.products.find(({ key }) => key === "ph-cimb-gsave");
    const gcash = catalog.institutions.find(({ key }) => key === "ph-gcash");
    expect(gsave?.channelInstitutionId).toBe(gcash?.id);
  });

  it("closes the open schedule when a newer one ships", async () => {
    const db = getTestDb();
    const id = await productId("ph-salmon-save");
    const [open] = await db
      .select()
      .from(interestRateSchedule)
      .where(eq(interestRateSchedule.productId, id));
    if (!open) {
      throw new Error("Missing Salmon schedule");
    }
    const [newer] = await db
      .insert(interestRateSchedule)
      .values({
        ...open,
        createdAt: undefined,
        effectiveFrom: "2027-01-01",
        id: undefined,
        tiers: [{ annualRate: "3.50", minBalance: "0" }],
      })
      .returning();
    try {
      await seedInterestCatalog(db);
      const rows = await db
        .select()
        .from(interestRateSchedule)
        .where(eq(interestRateSchedule.productId, id))
        .orderBy(sql`${interestRateSchedule.effectiveFrom} ASC NULLS FIRST`);
      expect(rows.map(({ effectiveTo }) => effectiveTo)).toEqual([
        "2026-12-31",
        null,
      ]);
      expect(rows[0]?.tiers).toEqual(open.tiers);
    } finally {
      // Reference rows outlive the test's truncate: put them back.
      if (newer) {
        await db
          .delete(interestRateSchedule)
          .where(eq(interestRateSchedule.id, newer.id));
      }
      await db
        .update(interestRateSchedule)
        .set({ effectiveTo: null })
        .where(eq(interestRateSchedule.id, open.id));
    }
  });
});

describe("account interest", () => {
  it("follows a preset and shows the bank as the institution", async () => {
    const { context } = await household();
    const [maribank] = await getTestDb()
      .select({ id: financialInstitution.id })
      .from(financialInstitution)
      .where(eq(financialInstitution.key, "ph-maribank"));

    const created = await call(
      accountsRouter.create,
      {
        ...bank,
        institution: "typed by hand",
        institutionId: maribank?.id,
        interest: interest({
          productId: await productId("ph-maribank-savings"),
        }),
        name: "Mari",
      },
      context
    );
    const account = await call(
      accountsRouter.get,
      { accountId: created.id },
      context
    );

    expect(account).toMatchObject({
      institution: "MariBank",
      institutionId: maribank?.id,
      interest: {
        customTerms: null,
        product: { key: "ph-maribank-savings" },
      },
    });
  });

  it("projects MariBank's marginal tiers from the ledger balance", async () => {
    const { context, organizationId } = await household();
    const created = await call(
      accountsRouter.create,
      {
        ...bank,
        interest: interest({
          productId: await productId("ph-maribank-savings"),
        }),
        name: "Mari",
      },
      context
    );
    const db = getTestDb();
    const postings = async () => {
      const [row] = await db
        .select({ value: count() })
        .from(financialTransaction)
        .where(eq(financialTransaction.accountId, created.id));
      return row?.value;
    };
    const before = await postings();

    const projection = await interestProjection(
      db,
      organizationId,
      created.id,
      OCT_10
    );

    // 140.41 gross a day, credited daily, for 1–10 October.
    expect(projection).toMatchObject({
      effectiveRate: "3.416666",
      followsPreset: true,
      nextCredit: {
        date: "2026-10-10",
        gross: "140.410000",
        net: "112.330000",
        tax: "28.080000",
      },
      toDate: {
        gross: "1404.100000",
        net: "1123.300000",
        since: "2026-10-01",
        tax: "280.800000",
      },
    });
    expect(projection?.projection?.until).toBe("2027-10-10");
    expect(await postings()).toBe(before);
    const reread = await call(
      accountsRouter.get,
      { accountId: created.id },
      context
    );
    expect(reread.balance).toBe(created.balance);
  });

  it("overrides a preset for one account without touching the catalog", async () => {
    const { context, organizationId } = await household();
    const db = getTestDb();
    const mariId = await productId("ph-maribank-savings");
    const catalogBefore = await db
      .select()
      .from(interestRateSchedule)
      .where(eq(interestRateSchedule.productId, mariId));
    const created = await call(
      accountsRouter.create,
      { ...bank, interest: interest({ productId: mariId }), name: "Mari" },
      context
    );

    await saveAccountInterest(
      db,
      organizationId,
      created,
      interest({ productId: mariId, terms: customTerms }),
      "2026-10-16"
    );

    const versions = await db
      .select()
      .from(financialAccountInterestRate)
      .where(eq(financialAccountInterestRate.accountId, created.id))
      .orderBy(asc(financialAccountInterestRate.effectiveFrom));
    expect(versions).toMatchObject([
      {
        effectiveFrom: "2026-10-01",
        effectiveTo: "2026-10-15",
        followsPreset: true,
      },
      { effectiveFrom: "2026-10-16", effectiveTo: null, followsPreset: false },
    ]);
    expect(
      await db
        .select()
        .from(interestRateSchedule)
        .where(eq(interestRateSchedule.productId, mariId))
    ).toEqual(catalogBefore);

    // Days before the override keep MariBank's rate: 15 × 140.41, then the
    // month's remaining days at 3.65% on 1.5M are 150.00 each, from 16 Oct.
    const projection = await interestProjection(
      db,
      organizationId,
      created.id,
      new Date("2026-10-20T04:00:00Z")
    );
    expect(projection?.terms?.tiers).toEqual(customTerms.tiers);
    const account = await call(
      accountsRouter.get,
      { accountId: created.id },
      context
    );
    expect(account.interest?.customTerms?.tiers).toEqual(customTerms.tiers);

    // Saving the same terms again adds no version.
    await saveAccountInterest(
      db,
      organizationId,
      created,
      interest({ productId: mariId, terms: customTerms }),
      "2026-10-20"
    );
    const open = await db
      .select()
      .from(financialAccountInterestRate)
      .where(
        and(
          eq(financialAccountInterestRate.accountId, created.id),
          isNull(financialAccountInterestRate.effectiveTo)
        )
      );
    expect(open).toHaveLength(1);
  });

  it("books a time deposit's rate so later preset changes leave it alone", async () => {
    const { context, organizationId } = await household();
    const db = getTestDb();
    const tonikId = await productId("ph-tonik-time-deposit");
    const created = await call(
      accountsRouter.create,
      {
        ...bank,
        interest: interest({
          productId: tonikId,
          startDate: "2026-01-01",
          term: { count: 6, unit: "month" },
        }),
        name: "Tonik TD",
        openingBalance: "100000",
        openingBalanceDate: "2026-01-01",
      },
      context
    );
    const [six] = await db
      .select()
      .from(interestRateSchedule)
      .where(
        and(
          eq(interestRateSchedule.productId, tonikId),
          eq(interestRateSchedule.termCount, 6)
        )
      );
    if (!six) {
      throw new Error("Missing Tonik 6-month schedule");
    }
    const [cut] = await db
      .insert(interestRateSchedule)
      .values({
        ...six,
        createdAt: undefined,
        effectiveFrom: "2026-03-01",
        id: undefined,
        tiers: [{ annualRate: "1.00", minBalance: "0" }],
      })
      .returning();
    try {
      const projection = await interestProjection(
        db,
        organizationId,
        created.id,
        new Date("2026-04-01T04:00:00Z")
      );

      // 181 days at 4% on the ₱100,000 placement, paid on 1 July.
      expect(projection).toMatchObject({
        followsPreset: false,
        maturityDate: "2026-07-01",
        nextCredit: { date: "2026-07-01", gross: "1983.560000" },
        principal: "100000.000000",
        projection: { toMaturity: true, until: "2026-07-01" },
      });
      const account = await call(
        accountsRouter.get,
        { accountId: created.id },
        context
      );
      expect(account.interest).toMatchObject({
        customTerms: null,
        maturityDate: "2026-07-01",
        term: { count: 6, unit: "month" },
      });

      await saveAccountInterest(
        db,
        organizationId,
        created,
        interest({
          bonusEligible: true,
          productId: tonikId,
          startDate: "2026-01-01",
          term: { count: 6, unit: "month" },
        }),
        "2026-04-01"
      );
      const bonus = await interestProjection(
        db,
        organizationId,
        created.id,
        new Date("2026-04-01T04:00:00Z")
      );
      expect(bonus?.nextCredit?.gross).toBe("2479.450000");
    } finally {
      if (cut) {
        await db
          .delete(interestRateSchedule)
          .where(eq(interestRateSchedule.id, cut.id));
      }
    }
  });

  it("keeps the booked rate when nothing about the deposit changes", async () => {
    const { context } = await household();
    const tonikId = await productId("ph-tonik-time-deposit");
    const values = {
      ...bank,
      interest: interest({
        productId: tonikId,
        startDate: "2026-01-01",
        term: { count: 6, unit: "month" as const },
      }),
      name: "Tonik TD",
      openingBalanceDate: "2026-01-01",
    };
    const created = await call(accountsRouter.create, values, context);

    await call(
      accountsRouter.update,
      { ...values, accountId: created.id, name: "Renamed" },
      context
    );

    const versions = await getTestDb()
      .select()
      .from(financialAccountInterestRate)
      .where(eq(financialAccountInterestRate.accountId, created.id));
    expect(versions).toHaveLength(1);
  });

  it("removes interest on null and when the account stops being a bank", async () => {
    const { context } = await household();
    const values = {
      ...bank,
      interest: interest({ productId: await productId("ph-salmon-save") }),
      name: "Salmon",
    };
    const created = await call(accountsRouter.create, values, context);

    await call(
      accountsRouter.update,
      {
        ...values,
        accountId: created.id,
        accountType: "cash",
        interest: undefined,
      },
      context
    );

    const account = await call(
      accountsRouter.get,
      { accountId: created.id },
      context
    );
    expect(account.interest).toBeNull();
    expect(
      await call(interestRouter.projection, { accountId: created.id }, context)
    ).toBeNull();
  });

  it("refuses a preset in another currency, and a product with no rate", async () => {
    const { context } = await household();

    expect(
      await code(
        call(
          accountsRouter.create,
          {
            ...bank,
            currencyCode: "USD",
            interest: interest({
              productId: await productId("ph-salmon-save"),
            }),
            name: "Dollars",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");
    expect(
      await code(
        call(
          accountsRouter.create,
          {
            ...bank,
            interest: interest({
              productId: await productId("ph-bdo-peso-time-deposit"),
            }),
            name: "BDO TD",
          },
          context
        )
      )
    ).toBe("BAD_REQUEST");
  });

  it("takes a custom rate for a product without a preset one", async () => {
    const { context, organizationId } = await household();
    const created = await call(
      accountsRouter.create,
      {
        ...bank,
        interest: interest({
          productId: await productId("ph-uniondigital-save"),
          terms: customTerms,
        }),
        name: "UBEH",
        openingBalance: "100000",
      },
      context
    );

    const projection = await interestProjection(
      getTestDb(),
      organizationId,
      created.id,
      OCT_10
    );

    // 10.00 a day, credited at month end.
    expect(projection).toMatchObject({
      nextCredit: { date: "2026-10-31", gross: "310.000000" },
      toDate: { gross: "100.000000", since: "2026-10-01" },
    });
  });
});
