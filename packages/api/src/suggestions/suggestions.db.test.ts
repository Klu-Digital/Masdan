import {
  category,
  featureFlag,
  file,
  financialTransaction,
  financialTransactionTag,
  transactionImportRow,
} from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import {
  getSessionFor,
  getTestDb,
  signUpTestUser,
  startTestQueue,
  stopTestQueue,
} from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type * as GatewayModule from "../ai/gateway";
import type { Context } from "../context";
import { invalidateFeatureFlags } from "../feature-flags/feature-flags.cache";
import { processImport } from "../imports/imports.process";
import { importsRouter } from "../imports/imports.router";
import type { ImportMapping } from "../imports/mapping";
import { rulesRouter } from "../rules/rules.router";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { suggestionsRouter } from "./suggestions.router";

const completeJson = vi.hoisted(() => vi.fn());
const isAiConfigured = vi.hoisted(() => vi.fn());
const bucket = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>() }));

// The gateway and the bucket are the only fakes: scoping, validation and the
// ledger writes are real.
vi.mock("../ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  completeJson,
  isAiConfigured,
}));

vi.mock("@masdan/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    storage: {
      bucket: "test-bucket",
      getObject: ({ key }: { key: string }) => bucket.objects.get(key) ?? null,
      isConfigured: () => true,
    },
  };
});

const setFlag = async (enabled: boolean) => {
  await getTestDb()
    .insert(featureFlag)
    .values({ enabled, name: "FF__AI_CATEGORIZATION" })
    .onConflictDoUpdate({ set: { enabled }, target: featureFlag.name });
  invalidateFeatureFlags();
};

/** What the model "answers": one item per listed transaction. */
const answer = (
  ...items: { category: string | null; ref: string; tags?: string[] }[]
) => ({
  items: items.map((item) => ({ tags: [], ...item })),
});

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const codeOf = async (promise: Promise<unknown>) => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

const household = async () => {
  const { headers, user } = await signUpTestUser();
  const session = await getSessionFor(headers);
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  const context = {
    context: {
      auth: null,
      db: getTestDb(),
      log: undefined,
      session,
    } as unknown as Context,
  };
  const categoryId = async (name: string) => {
    const [row] = await getTestDb()
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.organizationId, organizationId),
          eq(category.name, name)
        )
      );
    if (!row) {
      throw new Error(`Missing category ${name}`);
    }
    return row.id;
  };
  const account = await call(
    accountsRouter.create,
    {
      accountClass: "asset",
      accountType: "bank",
      liquidity: "liquid",
      name: "BPI Savings",
      openingBalance: "50000",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  const work = await call(
    tagsRouter.create,
    { color: "sky", name: "Work" },
    context
  );
  return {
    account,
    categories: {
      dining: await categoryId("Food & Dining"),
      groceries: await categoryId("Groceries"),
      salary: await categoryId("Salary"),
      transport: await categoryId("Transport"),
    },
    context,
    organizationId,
    tags: { work: work.id },
    userId: user.id,
  };
};

type Household = Awaited<ReturnType<typeof household>>;

const rule = (h: Household, name: string, text: string, categoryId: string) =>
  call(
    rulesRouter.create,
    {
      actions: { categoryId, tagIds: [] },
      conditions: {
        accountId: null,
        amountMax: null,
        amountMin: null,
        text: { operator: "contains", value: text },
        type: "expense",
      },
      name,
    },
    h.context
  );

const expense = (h: Household, notes: string | null) =>
  call(
    transactionsRouter.create,
    {
      accountId: h.account.id,
      amount: "180",
      categoryId: h.categories.groceries,
      notes,
      paidStatus: "paid",
      tagIds: [],
      transactionDate: "2026-09-01",
    },
    h.context
  );

const rowsOf = async (importId: string) => {
  const rows = await getTestDb()
    .select({
      categoryId: transactionImportRow.categoryId,
      description: transactionImportRow.description,
      id: transactionImportRow.id,
      suggestion: transactionImportRow.suggestion,
      transactionId: transactionImportRow.transactionId,
    })
    .from(transactionImportRow)
    .where(eq(transactionImportRow.importId, importId))
    .orderBy(asc(transactionImportRow.rowNumber));
  return new Map(rows.map((row) => [row.description, row]));
};

beforeAll(startTestQueue);
afterAll(stopTestQueue);

beforeEach(async () => {
  bucket.objects.clear();
  completeJson.mockReset();
  isAiConfigured.mockReset();
  isAiConfigured.mockReturnValue(true);
  await setFlag(true);
});

describe("suggestions for a saved transaction", () => {
  it("suggests without changing anything, then records what was accepted", async () => {
    const h = await household();
    const created = await expense(h, "Grab ride to the office");
    completeJson.mockResolvedValueOnce(
      answer({ category: "Transport", ref: "1", tags: ["Work"] })
    );

    const result = await call(
      suggestionsRouter.forTransaction,
      { transactionId: created.id },
      h.context
    );

    expect(result).toEqual({
      status: "suggested",
      suggested: { categoryId: h.categories.transport, tagIds: [h.tags.work] },
    });
    const untouched = await call(
      transactionsRouter.get,
      { transactionId: created.id },
      h.context
    );
    expect(untouched).toMatchObject({
      categoryId: h.categories.groceries,
      suggestionApplication: null,
      tags: [],
    });

    // The user keeps the category and drops the tag.
    const accepted = await call(
      suggestionsRouter.acceptForTransaction,
      {
        categoryId: h.categories.transport,
        suggested: {
          categoryId: h.categories.transport,
          tagIds: [h.tags.work],
        },
        tagIds: [],
        transactionId: created.id,
      },
      h.context
    );
    expect(accepted).toMatchObject({
      categoryId: h.categories.transport,
      suggestionApplication: {
        acceptedByUserId: h.userId,
        categoryId: h.categories.transport,
        suggested: {
          categoryId: h.categories.transport,
          tagIds: [h.tags.work],
        },
        tagIds: [],
      },
      tags: [],
    });

    // A manual recategorization means the suggestion no longer explains it.
    const edited = await call(
      transactionsRouter.update,
      {
        accountId: h.account.id,
        amount: "180",
        categoryId: h.categories.dining,
        notes: "Grab ride to the office",
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-09-01",
        transactionId: created.id,
      },
      h.context
    );
    expect(edited.suggestionApplication).toBeNull();
  });

  it("lets a matching rule answer first, without calling the model", async () => {
    const h = await household();
    await rule(h, "Grab", "grab", h.categories.transport);
    const created = await expense(h, "Grab ride");

    await expect(
      call(
        suggestionsRouter.forTransaction,
        { transactionId: created.id },
        h.context
      )
    ).resolves.toMatchObject({ status: "rule" });
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("is unavailable, never a guess, when the model fails or is not configured", async () => {
    const h = await household();
    const created = await expense(h, "Grab ride");
    completeJson.mockRejectedValueOnce(new Error("upstream timeout"));

    await expect(
      call(
        suggestionsRouter.forTransaction,
        { transactionId: created.id },
        h.context
      )
    ).resolves.toMatchObject({ status: "unavailable" });

    isAiConfigured.mockReturnValue(false);
    await expect(
      call(
        suggestionsRouter.forTransaction,
        { transactionId: created.id },
        h.context
      )
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it("proposes nothing when the model names a category this household lacks", async () => {
    const h = await household();
    const created = await expense(h, "Grab ride");
    completeJson.mockResolvedValueOnce(
      answer({ category: "Rideshare", ref: "1", tags: ["Commute"] })
    );

    await expect(
      call(
        suggestionsRouter.forTransaction,
        { transactionId: created.id },
        h.context
      )
    ).resolves.toMatchObject({ status: "none" });
  });

  it("won't accept a category that would break the transaction", async () => {
    const h = await household();
    const created = await expense(h, "Grab ride");

    await expect(
      codeOf(
        call(
          suggestionsRouter.acceptForTransaction,
          {
            categoryId: h.categories.salary,
            suggested: { categoryId: h.categories.salary, tagIds: [] },
            tagIds: [],
            transactionId: created.id,
          },
          h.context
        )
      )
    ).resolves.toBe("BAD_REQUEST");
    await expect(
      call(transactionsRouter.get, { transactionId: created.id }, h.context)
    ).resolves.toMatchObject({
      categoryId: h.categories.groceries,
      suggestionApplication: null,
    });
  });

  it("is isolated by household", async () => {
    const mine = await household();
    const theirs = await household();
    const created = await expense(mine, "Grab ride");

    await expect(
      codeOf(
        call(
          suggestionsRouter.forTransaction,
          { transactionId: created.id },
          theirs.context
        )
      )
    ).resolves.toBe("NOT_FOUND");
    await expect(
      codeOf(
        call(
          suggestionsRouter.acceptForTransaction,
          {
            categoryId: theirs.categories.transport,
            suggested: { categoryId: theirs.categories.transport, tagIds: [] },
            tagIds: [],
            transactionId: created.id,
          },
          mine.context
        )
      )
    ).resolves.toBe("BAD_REQUEST");
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("is unreachable while the flag is off", async () => {
    const h = await household();
    const created = await expense(h, "Grab ride");
    await setFlag(false);

    await expect(
      codeOf(
        call(
          suggestionsRouter.forTransaction,
          { transactionId: created.id },
          h.context
        )
      )
    ).resolves.toBe("NOT_FOUND");
    await expect(
      codeOf(
        call(
          suggestionsRouter.acceptForTransaction,
          {
            categoryId: h.categories.transport,
            suggested: { categoryId: h.categories.transport, tagIds: [] },
            tagIds: [],
            transactionId: created.id,
          },
          h.context
        )
      )
    ).resolves.toBe("NOT_FOUND");
    // Editing by hand is untouched by the flag.
    await expect(
      call(
        transactionsRouter.update,
        {
          accountId: h.account.id,
          amount: "180",
          categoryId: h.categories.transport,
          notes: "Grab ride",
          paidStatus: "paid",
          tagIds: [],
          transactionDate: "2026-09-01",
          transactionId: created.id,
        },
        h.context
      )
    ).resolves.toMatchObject({ categoryId: h.categories.transport });
  });
});

/** Model answer for the four distinct descriptions, in row order. */
const modelAnswer = () =>
  answer(
    { category: "Salary", ref: "1" },
    { category: "Food & Dining", ref: "2", tags: ["Work"] },
    { category: "Transport", ref: "3" },
    { category: null, ref: "4" }
  );

describe("suggestions in import review", () => {
  const mapping: ImportMapping = {
    amount: { column: 2, kind: "signed", negativeMeans: "expense" },
    categoryColumn: 3,
    dateColumn: 0,
    dateFormat: "ymd",
    decimalSeparator: ".",
    delimiter: ",",
    descriptionColumn: 1,
    hasHeaderRow: true,
    notesColumn: null,
  };

  const CSV = [
    "Date,Description,Amount,Category",
    "2026-02-01,ACME PAYROLL,25000,",
    "2026-02-02,JOLLIBEE MAKATI,-400,",
    "2026-02-03,Jollibee  makati,-250,",
    "2026-02-04,GRAB RIDE 5210123456,-180,",
    "2026-02-05,Puregold,-1500,",
    "2026-02-06,Mercury Drug,-300,Health",
    "2026-02-07,SM STORE,-999,",
  ].join("\n");

  /** A validated import awaiting review, with a rule on Puregold. */
  const readyImport = async (h: Household) => {
    await rule(h, "Puregold", "puregold", h.categories.groceries);
    const key = `${h.organizationId}/${crypto.randomUUID()}/bank.csv`;
    bucket.objects.set(key, new TextEncoder().encode(CSV));
    const [source] = await getTestDb()
      .insert(file)
      .values({
        bucket: "test-bucket",
        contentType: "text/csv",
        key,
        name: "bank.csv",
        organizationId: h.organizationId,
        size: CSV.length,
        status: "ready",
        userId: h.userId,
      })
      .returning({ id: file.id });
    if (!source) {
      throw new Error("Could not insert file");
    }
    const created = await call(
      importsRouter.create,
      {
        accountId: h.account.id,
        defaultExpenseCategoryId: h.categories.groceries,
        defaultIncomeCategoryId: h.categories.salary,
        fileId: source.id,
        mapping,
        openingBalanceMode: "reject",
      },
      h.context
    );
    await processImport(getTestDb(), created.id);
    return created.id;
  };

  it("suggests once per description, only for rows nothing else decided", async () => {
    const h = await household();
    const importId = await readyImport(h);
    completeJson.mockResolvedValueOnce(modelAnswer());

    const result = await call(
      suggestionsRouter.forImport,
      { importId },
      h.context
    );

    expect(result).toEqual({ pending: 3, status: "suggested", unsuggested: 0 });
    expect(completeJson).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(
      completeJson.mock.calls[0]?.[0].messages[1].content
    );
    expect(sent.transactions).toEqual([
      { ref: "1", text: "ACME PAYROLL", type: "income" },
      { ref: "2", text: "JOLLIBEE MAKATI", type: "expense" },
      { ref: "3", text: "GRAB RIDE #", type: "expense" },
      { ref: "4", text: "SM STORE", type: "expense" },
    ]);

    const rows = await rowsOf(importId);
    expect(rows.get("JOLLIBEE MAKATI")?.suggestion).toMatchObject({
      status: "pending",
      suggested: { categoryId: h.categories.dining, tagIds: [h.tags.work] },
    });
    expect(rows.get("Jollibee  makati")?.suggestion?.status).toBe("pending");
    // Salary is already the income default: nothing to suggest.
    expect(rows.get("ACME PAYROLL")?.suggestion?.status).toBe("empty");
    expect(rows.get("SM STORE")?.suggestion?.status).toBe("empty");
    // A rule and a mapped category column already decided these.
    expect(rows.get("Puregold")?.suggestion).toBeNull();
    expect(rows.get("Mercury Drug")?.suggestion).toBeNull();
    // Annotated only: no row moved off its default category.
    expect(rows.get("JOLLIBEE MAKATI")?.categoryId).toBe(
      h.categories.groceries
    );
  });

  it("commits accepted, edited and rejected suggestions exactly as reviewed", async () => {
    const h = await household();
    const importId = await readyImport(h);
    completeJson.mockResolvedValueOnce(modelAnswer());
    await call(suggestionsRouter.forImport, { importId }, h.context);
    const rows = await rowsOf(importId);
    const jollibee = rows.get("JOLLIBEE MAKATI");
    const jollibeeAgain = rows.get("Jollibee  makati");
    const grab = rows.get("GRAB RIDE 5210123456");
    if (!(jollibee && jollibeeAgain && grab)) {
      throw new Error("Missing rows");
    }

    await expect(
      call(
        suggestionsRouter.resolveImportRows,
        {
          decisions: [
            {
              action: "accept",
              categoryId: h.categories.dining,
              rowId: jollibee.id,
              tagIds: [h.tags.work],
            },
            { action: "reject", rowId: jollibeeAgain.id },
          ],
          importId,
        },
        h.context
      )
    ).resolves.toEqual({
      accepted: 1,
      pending: 1,
      rejected: 1,
      unsuggested: 0,
    });

    // Already reviewed: deciding again is a conflict, not a silent overwrite.
    await expect(
      codeOf(
        call(
          suggestionsRouter.resolveImportRows,
          { decisions: [{ action: "reject", rowId: jollibee.id }], importId },
          h.context
        )
      )
    ).resolves.toBe("CONFLICT");

    await call(importsRouter.commit, { importId }, h.context);
    await processImport(getTestDb(), importId);

    const committed = await rowsOf(importId);
    const transactionOf = (description: string) => {
      const transactionId = committed.get(description)?.transactionId;
      if (!transactionId) {
        throw new Error(`${description} was not imported`);
      }
      return call(transactionsRouter.get, { transactionId }, h.context);
    };

    await expect(transactionOf("JOLLIBEE MAKATI")).resolves.toMatchObject({
      categoryId: h.categories.dining,
      suggestionApplication: {
        acceptedByUserId: h.userId,
        categoryId: h.categories.dining,
        suggested: { categoryId: h.categories.dining, tagIds: [h.tags.work] },
        tagIds: [h.tags.work],
      },
      tags: [expect.objectContaining({ id: h.tags.work })],
    });
    await expect(transactionOf("Jollibee  makati")).resolves.toMatchObject({
      categoryId: h.categories.groceries,
      suggestionApplication: null,
      tags: [],
    });
    // Still pending at commit: imported on the default, with no provenance.
    await expect(transactionOf("GRAB RIDE 5210123456")).resolves.toMatchObject({
      categoryId: h.categories.groceries,
      suggestionApplication: null,
    });
  });

  it("accepts every pending suggestion at once", async () => {
    const h = await household();
    const importId = await readyImport(h);
    completeJson.mockResolvedValueOnce(modelAnswer());
    await call(suggestionsRouter.forImport, { importId }, h.context);

    await expect(
      call(suggestionsRouter.acceptAllForImport, { importId }, h.context)
    ).resolves.toEqual({
      accepted: 3,
      pending: 0,
      rejected: 0,
      unsuggested: 0,
    });

    const rows = await rowsOf(importId);
    expect(rows.get("GRAB RIDE 5210123456")).toMatchObject({
      categoryId: h.categories.transport,
      suggestion: { status: "accepted" },
    });
    expect(rows.get("SM STORE")).toMatchObject({
      categoryId: h.categories.groceries,
      suggestion: { status: "empty" },
    });
  });

  it("rejects an accepted category of the wrong direction", async () => {
    const h = await household();
    const importId = await readyImport(h);
    completeJson.mockResolvedValueOnce(modelAnswer());
    await call(suggestionsRouter.forImport, { importId }, h.context);
    const reviewRows = await rowsOf(importId);
    const grab = reviewRows.get("GRAB RIDE 5210123456");
    if (!grab) {
      throw new Error("Missing row");
    }

    await expect(
      codeOf(
        call(
          suggestionsRouter.resolveImportRows,
          {
            decisions: [
              {
                action: "accept",
                categoryId: h.categories.salary,
                rowId: grab.id,
                tagIds: [],
              },
            ],
            importId,
          },
          h.context
        )
      )
    ).resolves.toBe("BAD_REQUEST");
    const after = await rowsOf(importId);
    expect(after.get("GRAB RIDE 5210123456")).toMatchObject({
      categoryId: h.categories.groceries,
      suggestion: { status: "pending" },
    });
  });

  it("leaves every row untouched when the model fails", async () => {
    const h = await household();
    const importId = await readyImport(h);
    completeJson.mockRejectedValueOnce(new Error("malformed"));

    await expect(
      call(suggestionsRouter.forImport, { importId }, h.context)
    ).resolves.toMatchObject({ status: "unavailable" });
    const untouched = await rowsOf(importId);
    for (const row of untouched.values()) {
      expect(row.suggestion).toBeNull();
    }
    await expect(
      call(suggestionsRouter.importSummary, { importId }, h.context)
    ).resolves.toEqual({ pending: 0, unsuggested: 5 });
  });

  it("is isolated by household", async () => {
    const mine = await household();
    const theirs = await household();
    const importId = await readyImport(mine);
    completeJson.mockResolvedValueOnce(modelAnswer());
    await call(suggestionsRouter.forImport, { importId }, mine.context);
    const reviewRows = await rowsOf(importId);
    const grab = reviewRows.get("GRAB RIDE 5210123456");
    if (!grab) {
      throw new Error("Missing row");
    }

    await expect(
      codeOf(call(suggestionsRouter.forImport, { importId }, theirs.context))
    ).resolves.toBe("NOT_FOUND");
    await expect(
      codeOf(
        call(suggestionsRouter.acceptAllForImport, { importId }, theirs.context)
      )
    ).resolves.toBe("NOT_FOUND");
    // Their category on my row, through my own import: refused.
    await expect(
      codeOf(
        call(
          suggestionsRouter.resolveImportRows,
          {
            decisions: [
              {
                action: "accept",
                categoryId: theirs.categories.transport,
                rowId: grab.id,
                tagIds: [],
              },
            ],
            importId,
          },
          mine.context
        )
      )
    ).resolves.toBe("BAD_REQUEST");
  });

  it("is unreachable while the flag is off, and import still works", async () => {
    const h = await household();
    const importId = await readyImport(h);
    await setFlag(false);

    await expect(
      codeOf(call(suggestionsRouter.forImport, { importId }, h.context))
    ).resolves.toBe("NOT_FOUND");
    await expect(
      codeOf(call(suggestionsRouter.importSummary, { importId }, h.context))
    ).resolves.toBe("NOT_FOUND");

    await call(importsRouter.commit, { importId }, h.context);
    await processImport(getTestDb(), importId);
    await expect(
      call(importsRouter.get, { importId }, h.context)
    ).resolves.toMatchObject({ importedRows: 7, status: "completed" });
    const tagged = await getTestDb()
      .select({ id: financialTransactionTag.transactionId })
      .from(financialTransactionTag)
      .innerJoin(
        financialTransaction,
        eq(financialTransaction.id, financialTransactionTag.transactionId)
      )
      .where(eq(financialTransaction.organizationId, h.organizationId));
    expect(tagged).toEqual([]);
  });
});
