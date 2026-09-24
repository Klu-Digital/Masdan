import {
  category,
  creditCardStatement,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountOwner,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  financialTransfer,
  member,
  session,
  tag,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { parseCsvRecords } from "@masdan/testing/csv";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";
import { EXPORT_DATASETS } from "./datasets";
import type { ExportDatasetName } from "./datasets";
import { exportsRouter } from "./exports.router";

const DATASET_NAMES = Object.keys(EXPORT_DATASETS) as ExportDatasetName[];
const ARCHIVED_AT = new Date("2026-02-01T08:00:00.000Z");

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const caught: unknown = await promise
    .then(() => {})
    .catch((error: unknown) => error);
  return caught instanceof ORPCError ? caught.code : undefined;
};

const activeOrganizationId = async (headers: Headers): Promise<string> => {
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return organizationId;
};

const one = <Row>(rows: Row[]): Row => {
  const [row] = rows;
  if (!row) {
    throw new Error("Insert returned no row");
  }
  return row;
};

/** One of every financially relevant record, archived and live. */
const seedHousehold = async (
  headers: Headers,
  userId: string,
  label: string
) => {
  const db = getTestDb();
  const organizationId = await activeOrganizationId(headers);
  const owner = one(
    await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId)
        )
      )
  );

  const [dining, salary, oldCategory] = await db
    .insert(category)
    .values([
      {
        color: "orange",
        icon: "🍜",
        name: `${label} Dining, "out"`,
        organizationId,
        sortOrder: 1,
        type: "expense",
      },
      {
        color: "green",
        icon: "💼",
        name: `${label} Salary`,
        organizationId,
        sortOrder: 2,
        type: "income",
      },
      {
        archivedAt: ARCHIVED_AT,
        color: "gray",
        icon: "📦",
        name: `${label} Retired category`,
        organizationId,
        sortOrder: 3,
        type: "expense",
      },
    ])
    .returning();
  if (!(dining && salary && oldCategory)) {
    throw new Error("Category seed failed");
  }

  const [bank, card, closed] = await db
    .insert(financialAccount)
    .values([
      {
        accountClass: "asset",
        accountType: "bank",
        currencyCode: "PHP",
        institution: '=HYPERLINK("evil")',
        liquidity: "liquid",
        name: `${label} Bank`,
        openingBalance: "1000.500000",
        openingBalanceDate: "2026-01-01",
        organizationId,
      },
      {
        accountClass: "liability",
        accountType: "credit_card",
        creditLimit: "50000",
        currencyCode: "PHP",
        name: `${label} Card`,
        openingBalance: "0",
        openingBalanceDate: "2026-01-01",
        organizationId,
        paymentDueDay: 15,
        statementClosingDay: 25,
      },
      {
        accountClass: "asset",
        accountType: "cash",
        archivedAt: ARCHIVED_AT,
        currencyCode: "PHP",
        includeInNetWorth: false,
        name: `${label} Closed wallet`,
        openingBalance: "-12.340000",
        openingBalanceDate: "2025-06-01",
        organizationId,
      },
    ])
    .returning();
  if (!(bank && card && closed)) {
    throw new Error("Account seed failed");
  }
  await db
    .insert(financialAccountOwner)
    .values({ financialAccountId: bank.id, memberId: owner.id });

  const [liveTag, oldTag] = await db
    .insert(tag)
    .values([
      { color: "blue", name: `${label} Trip`, organizationId },
      {
        archivedAt: ARCHIVED_AT,
        color: "gray",
        name: `${label} Past`,
        organizationId,
      },
    ])
    .returning();
  if (!(liveTag && oldTag)) {
    throw new Error("Tag seed failed");
  }

  const base = {
    currencyCode: "PHP",
    organizationId,
    paidStatus: "paid" as const,
  };
  const [expense, income, archived, split] = await db
    .insert(financialTransaction)
    .values([
      {
        ...base,
        accountId: bank.id,
        amount: "200.250000",
        categoryId: dining.id,
        notes: 'Line one\nLine "two", =cmd',
        transactionDate: "2026-01-05",
      },
      {
        ...base,
        accountId: bank.id,
        amount: "5000",
        categoryId: salary.id,
        transactionDate: "2026-01-02",
      },
      {
        ...base,
        accountId: closed.id,
        amount: "99.999999",
        archivedAt: ARCHIVED_AT,
        categoryId: oldCategory.id,
        transactionDate: "2026-01-03",
      },
      {
        ...base,
        accountId: card.id,
        amount: "300",
        categoryId: dining.id,
        paidStatus: "unpaid",
        transactionDate: "2026-01-10",
      },
    ])
    .returning();
  if (!(expense && income && archived && split)) {
    throw new Error("Transaction seed failed");
  }
  await db.insert(financialTransactionTag).values([
    { tagId: liveTag.id, transactionId: expense.id },
    { tagId: oldTag.id, transactionId: expense.id },
  ]);
  const splits = await db
    .insert(financialTransactionSplit)
    .values([
      {
        amount: "100",
        categoryId: dining.id,
        sortOrder: 0,
        transactionId: split.id,
      },
      {
        amount: "200",
        categoryId: oldCategory.id,
        sortOrder: 1,
        transactionId: split.id,
      },
    ])
    .returning();

  const transfer = one(
    await db
      .insert(financialTransfer)
      .values({
        destinationAccountId: card.id,
        destinationAmount: "150",
        notes: `${label} card payment`,
        organizationId,
        sourceAccountId: bank.id,
        sourceAmount: "150",
        transactionDate: "2026-01-20",
      })
      .returning()
  );
  const [sourcePosting, destinationPosting] = await db
    .insert(financialTransaction)
    .values([
      {
        ...base,
        accountId: bank.id,
        amount: "150",
        transactionDate: "2026-01-20",
        transferId: transfer.id,
        transferSide: "source",
      },
      {
        ...base,
        accountId: card.id,
        amount: "150",
        transactionDate: "2026-01-20",
        transferId: transfer.id,
        transferSide: "destination",
      },
    ])
    .returning();
  if (!(sourcePosting && destinationPosting)) {
    throw new Error("Transfer seed failed");
  }

  const snapshot = one(
    await db
      .insert(financialAccountBalanceSnapshot)
      .values({
        accountId: closed.id,
        balance: "-1234567890123.123456",
        effectiveDate: "2025-12-31",
        importReference: `${label}-ref`,
        source: "import",
      })
      .returning()
  );
  const statement = one(
    await db
      .insert(creditCardStatement)
      .values({
        accountId: card.id,
        dueDate: "2026-02-15",
        minimumAmountDue: "1000",
        organizationId,
        periodEnd: "2026-01-25",
        periodStart: "2025-12-26",
        statementBalance: "23000.500000",
        statementDate: "2026-01-25",
      })
      .returning()
  );

  return {
    accounts: { bank, card, closed },
    categories: { dining, oldCategory, salary },
    organizationId,
    ownerMemberId: owner.id,
    snapshot,
    splits,
    statement,
    tags: { liveTag, oldTag },
    transactions: {
      archived,
      destinationPosting,
      expense,
      income,
      sourcePosting,
      split,
    },
    transfer,
  };
};

type Seed = Awaited<ReturnType<typeof seedHousehold>>;

const exportAll = async (context: Context) => {
  const files = new Map<ExportDatasetName, string>();
  for (const name of DATASET_NAMES) {
    const result = await call(exportsRouter[name], undefined, { context });
    expect(result.fileName).toBe(EXPORT_DATASETS[name].fileName);
    expect(result.rowCount).toBe(parseCsvRecords(result.csv).records.length);
    files.set(name, result.csv);
  }
  return files;
};

const recordsOf = (
  files: Map<ExportDatasetName, string>,
  name: ExportDatasetName
) => parseCsvRecords(files.get(name) ?? "").records;

const byId = (records: Record<string, string>[], id: string) => {
  const record = records.find((row) => row.id === id);
  if (!record) {
    throw new Error(`Missing exported row ${id}`);
  }
  return record;
};

const seededIds = (seed: Seed): string[] => [
  seed.organizationId,
  seed.ownerMemberId,
  seed.snapshot.id,
  seed.statement.id,
  seed.transfer.id,
  ...Object.values(seed.accounts).map((row) => row.id),
  ...Object.values(seed.categories).map((row) => row.id),
  ...Object.values(seed.tags).map((row) => row.id),
  ...Object.values(seed.transactions).map((row) => row.id),
  ...seed.splits.map((row) => row.id),
];

describe("household CSV exports", () => {
  it("exports every dataset with archived and historical records", async () => {
    const user = await signUpTestUser();
    const context = await contextFor(user.headers);
    const seed = await seedHousehold(user.headers, user.user.id, "Casa");
    const files = await exportAll(context);

    const transactions = recordsOf(files, "transactions");
    expect(transactions.map((row) => row.id)).toEqual([
      seed.transactions.income.id,
      seed.transactions.archived.id,
      seed.transactions.expense.id,
      seed.transactions.split.id,
      ...[
        seed.transactions.sourcePosting.id,
        seed.transactions.destinationPosting.id,
      ].toSorted(),
    ]);
    expect(byId(transactions, seed.transactions.expense.id)).toMatchObject({
      account_name: "Casa Bank",
      amount: "200.250000",
      archived_at: "",
      category_name: 'Casa Dining, "out"',
      category_type: "expense",
      currency_code: "PHP",
      notes: 'Line one\nLine "two", =cmd',
      paid_status: "paid",
      split_count: "0",
      tag_names: "Casa Past; Casa Trip",
      transaction_date: "2026-01-05",
    });
    expect(byId(transactions, seed.transactions.archived.id)).toMatchObject({
      account_name: "Casa Closed wallet",
      amount: "99.999999",
      archived_at: ARCHIVED_AT.toISOString(),
      category_name: "Casa Retired category",
    });
    expect(byId(transactions, seed.transactions.split.id)).toMatchObject({
      paid_status: "unpaid",
      split_count: "2",
    });
    expect(
      byId(transactions, seed.transactions.sourcePosting.id)
    ).toMatchObject({
      category_id: "",
      transfer_counterpart_account_id: seed.accounts.card.id,
      transfer_counterpart_account_name: "Casa Card",
      transfer_id: seed.transfer.id,
      transfer_side: "source",
    });
    expect(
      byId(transactions, seed.transactions.destinationPosting.id)
    ).toMatchObject({
      transfer_counterpart_account_name: "Casa Bank",
      transfer_side: "destination",
    });

    expect(recordsOf(files, "transactionSplits")).toEqual([
      expect.objectContaining({
        amount: "100.000000",
        category_name: 'Casa Dining, "out"',
        sort_order: "0",
        transaction_id: seed.transactions.split.id,
      }),
      expect.objectContaining({
        amount: "200.000000",
        category_name: "Casa Retired category",
        sort_order: "1",
      }),
    ]);
    expect(recordsOf(files, "transactionTags")).toEqual([
      expect.objectContaining({
        tag_archived_at: ARCHIVED_AT.toISOString(),
        tag_name: "Casa Past",
      }),
      expect.objectContaining({ tag_archived_at: "", tag_name: "Casa Trip" }),
    ]);

    const accounts = recordsOf(files, "accounts");
    expect(byId(accounts, seed.accounts.bank.id)).toMatchObject({
      account_class: "asset",
      account_type: "bank",
      // 1000.5 opening + 5000 income - 200.25 expense - 150 transfer out.
      current_balance: "5650.250000",
      include_in_net_worth: "true",
      institution: '\'=HYPERLINK("evil")',
      liquidity: "liquid",
      opening_balance: "1000.500000",
      opening_balance_date: "2026-01-01",
      owner_member_ids: seed.ownerMemberId,
      owner_names: user.user.name,
    });
    expect(byId(accounts, seed.accounts.closed.id)).toMatchObject({
      archived_at: ARCHIVED_AT.toISOString(),
      current_balance: "-12.340000",
      include_in_net_worth: "false",
      opening_balance: "-12.340000",
    });
    expect(byId(accounts, seed.accounts.card.id)).toMatchObject({
      credit_limit: "50000.000000",
      current_balance: "150.000000",
      payment_due_day: "15",
      statement_closing_day: "25",
    });

    expect(recordsOf(files, "accountBalanceSnapshots")).toEqual([
      expect.objectContaining({
        account_archived_at: ARCHIVED_AT.toISOString(),
        balance: "-1234567890123.123456",
        effective_date: "2025-12-31",
        id: seed.snapshot.id,
        import_reference: "Casa-ref",
        source: "import",
      }),
    ]);
    expect(recordsOf(files, "transfers")).toEqual([
      expect.objectContaining({
        destination_account_name: "Casa Card",
        destination_transaction_id: seed.transactions.destinationPosting.id,
        id: seed.transfer.id,
        source_account_name: "Casa Bank",
        source_amount: "150.000000",
        source_transaction_id: seed.transactions.sourcePosting.id,
      }),
    ]);
    expect(recordsOf(files, "creditCardStatements")).toEqual([
      expect.objectContaining({
        account_name: "Casa Card",
        due_date: "2026-02-15",
        id: seed.statement.id,
        minimum_amount_due: "1000.000000",
        period_end: "2026-01-25",
        period_start: "2025-12-26",
        statement_balance: "23000.500000",
        statement_date: "2026-01-25",
      }),
    ]);

    const categories = recordsOf(files, "categories");
    expect(byId(categories, seed.categories.oldCategory.id)).toMatchObject({
      archived_at: ARCHIVED_AT.toISOString(),
      type: "expense",
    });
    expect(byId(categories, seed.categories.salary.id).type).toBe("income");
    expect(recordsOf(files, "tags").map((row) => row.name)).toEqual([
      "Casa Past",
      "Casa Trip",
    ]);

    // The raw CSV quotes the multi-line note instead of splitting the row.
    expect(files.get("transactions")).toContain(
      '"Line one\nLine ""two"", =cmd"'
    );
    await expect(exportAll(context)).resolves.toEqual(files);
  });

  it("never includes another household's records, even through links", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const firstSeed = await seedHousehold(
      first.headers,
      first.user.id,
      "Qxv7Alpha"
    );
    const secondSeed = await seedHousehold(
      second.headers,
      second.user.id,
      "Qxv7Bravo"
    );

    // A corrupt cross-tenant link must not pull a foreign name into either file.
    await getTestDb().insert(financialTransactionTag).values({
      tagId: firstSeed.tags.liveTag.id,
      transactionId: secondSeed.transactions.income.id,
    });

    const firstFiles = await exportAll(await contextFor(first.headers));
    const secondFiles = await exportAll(await contextFor(second.headers));

    for (const [files, foreign] of [
      [firstFiles, { label: "Qxv7Bravo", seed: secondSeed }],
      [secondFiles, { label: "Qxv7Alpha", seed: firstSeed }],
    ] as const) {
      for (const csv of files.values()) {
        expect(csv).not.toContain(foreign.label);
        for (const id of seededIds(foreign.seed)) {
          expect(csv).not.toContain(id);
        }
      }
    }
    expect(recordsOf(firstFiles, "transactions")).toHaveLength(6);
    expect(
      byId(
        recordsOf(secondFiles, "transactions"),
        secondSeed.transactions.income.id
      ).tag_names
    ).toBe("");
  });

  it("requires membership and a role with read access", async () => {
    const owner = await signUpTestUser();
    const outsider = await signUpTestUser();
    const organizationId = await activeOrganizationId(owner.headers);
    await seedHousehold(owner.headers, owner.user.id, "Gate");

    await getTestDb()
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.userId, outsider.user.id));
    const outsiderContext = await contextFor(outsider.headers);
    const anonymous = {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session: null,
    } as unknown as Context;

    const viewer = await signUpTestUser();
    await getTestDb().insert(member).values({
      organizationId,
      role: "viewer",
      userId: viewer.user.id,
    });
    await getTestDb()
      .update(session)
      .set({ activeOrganizationId: organizationId })
      .where(eq(session.userId, viewer.user.id));
    const viewerContext = await contextFor(viewer.headers);

    for (const name of DATASET_NAMES) {
      expect(
        await codeOf(
          call(appRouter.exports[name], undefined, { context: anonymous })
        )
      ).toBe("UNAUTHORIZED");
      expect(
        await codeOf(
          call(appRouter.exports[name], undefined, { context: outsiderContext })
        )
      ).toBe("FORBIDDEN");
      await expect(
        call(appRouter.exports[name], undefined, { context: viewerContext })
      ).resolves.toMatchObject({ fileName: EXPORT_DATASETS[name].fileName });
    }

    await getTestDb()
      .update(member)
      .set({ role: "guest" })
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, viewer.user.id)
        )
      );
    for (const name of DATASET_NAMES) {
      expect(
        await codeOf(
          call(appRouter.exports[name], undefined, { context: viewerContext })
        )
      ).toBe("FORBIDDEN");
    }
  });
});
