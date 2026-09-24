import {
  category,
  file,
  financialTransaction,
  financialTransactionAttachment,
  member,
  session,
  transactionImport,
} from "@masdan/db/schema/index";
import type * as StorageModule from "@masdan/storage";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Context } from "../context";
import { appRouter } from "../routers/index";
import { MAX_ATTACHMENTS_PER_TRANSACTION } from "./attachments.router";

/** The bucket is faked, as in the files suite; everything else is real. */
const bucket = vi.hoisted(() => ({
  objects: new Map<
    string,
    { size: number; contentType: string; etag: string }
  >(),
}));

vi.mock("@masdan/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    storage: {
      bucket: "test-bucket",
      deleteObject: ({ key }: { key: string }) => {
        bucket.objects.delete(key);
      },
      headObject: ({ key }: { key: string }) => bucket.objects.get(key) ?? null,
      isConfigured: () => true,
      maxUploadBytes: 26_214_400,
      presignDownload: ({ key }: { key: string }) =>
        `https://bucket.test/${key}?download`,
      presignUpload: ({ key }: { key: string }) =>
        `https://bucket.test/${key}?upload`,
      putObject: async () => {},
    },
  };
});

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const codeOf = async (
  promise: Promise<unknown>
): Promise<string | undefined> => {
  const error = await caught(promise);
  return error instanceof ORPCError ? error.code : undefined;
};

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

interface Household {
  context: { context: Context };
  organizationId: string;
  userId: string;
}

const signUpHousehold = async (): Promise<Household> => {
  const user = await signUpTestUser();
  const context = await contextFor(user.headers);
  const organizationId = context.session?.session.activeOrganizationId;
  if (!organizationId) {
    throw new Error("Test user has no active household");
  }
  return { context: { context }, organizationId, userId: user.user.id };
};

/** Joins `household` with `role`, the way an accepted invitation would. */
const joinAs = async (
  household: Household,
  role: string
): Promise<Household> => {
  const user = await signUpTestUser();
  await getTestDb()
    .insert(member)
    .values({
      organizationId: household.organizationId,
      role,
      userId: user.user.id,
    });
  await getTestDb()
    .update(session)
    .set({ activeOrganizationId: household.organizationId })
    .where(eq(session.userId, user.user.id));
  return {
    context: { context: await contextFor(user.headers) },
    organizationId: household.organizationId,
    userId: user.user.id,
  };
};

const accountInput = {
  accountClass: "asset" as const,
  accountType: "bank" as const,
  liquidity: "liquid" as const,
  name: "BPI Savings",
  openingBalance: "1000",
  openingBalanceDate: "2026-01-01",
  ownerMemberIds: [],
};

const groceriesFor = async (organizationId: string): Promise<string> => {
  const [row] = await getTestDb()
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.organizationId, organizationId),
        eq(category.name, "Groceries")
      )
    )
    .limit(1);
  if (!row) {
    throw new Error("Missing seeded Groceries category");
  }
  return row.id;
};

const createExpense = async (household: Household) => {
  const account = await call(
    appRouter.accounts.create,
    accountInput,
    household.context
  );
  const transaction = await call(
    appRouter.transactions.create,
    {
      accountId: account.id,
      amount: "125.50",
      categoryId: await groceriesFor(household.organizationId),
      paidStatus: "paid",
      tagIds: [],
      transactionDate: "2026-01-05",
    },
    household.context
  );
  return { account, transaction };
};

/** Through the real files router: reserve, "PUT" into the fake bucket, confirm. */
const uploadReceipt = async (
  household: Household,
  { confirm = true, name = "receipt.pdf" } = {}
) => {
  const { fileId, key } = await call(
    appRouter.files.createUpload,
    { contentType: "application/pdf", name, size: 2048 },
    household.context
  );
  if (confirm) {
    bucket.objects.set(key, {
      contentType: "application/pdf",
      etag: "etag",
      size: 2048,
    });
    await call(appRouter.files.confirmUpload, { fileId }, household.context);
  }
  return { fileId, key };
};

const linkRows = (fileId: string) =>
  getTestDb()
    .select()
    .from(financialTransactionAttachment)
    .where(eq(financialTransactionAttachment.fileId, fileId));

const fileRows = (fileId: string) =>
  getTestDb().select().from(file).where(eq(file.id, fileId));

beforeEach(() => {
  bucket.objects.clear();
});

describe("attachments.attach", () => {
  it("links several confirmed uploads to one transaction and lists them oldest first", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const first = await uploadReceipt(household, { name: "receipt.pdf" });
    const second = await uploadReceipt(household, { name: "invoice.pdf" });

    const attached = await call(
      appRouter.attachments.attach,
      { fileId: first.fileId, transactionId: transaction.id },
      household.context
    );
    await call(
      appRouter.attachments.attach,
      { fileId: second.fileId, transactionId: transaction.id },
      household.context
    );

    expect(attached).toMatchObject({
      contentType: "application/pdf",
      id: first.fileId,
      name: "receipt.pdf",
      size: 2048,
      status: "ready",
      transactionId: transaction.id,
      userId: household.userId,
    });
    expect(attached).not.toHaveProperty("key");

    const listed = await call(
      appRouter.attachments.list,
      { transactionId: transaction.id },
      household.context
    );
    expect(listed.map(({ name }) => name)).toEqual([
      "receipt.pdf",
      "invoice.pdf",
    ]);
  });

  it("refuses a file whose upload was never confirmed", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const pending = await uploadReceipt(household, { confirm: false });

    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: pending.fileId, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("CONFLICT");
    expect(await linkRows(pending.fileId)).toHaveLength(0);
  });

  it("refuses a file that is already attached, to this or another transaction", async () => {
    const household = await signUpHousehold();
    const { account, transaction } = await createExpense(household);
    const other = await call(
      appRouter.transactions.create,
      {
        accountId: account.id,
        amount: "10",
        categoryId: await groceriesFor(household.organizationId),
        paidStatus: "paid",
        tagIds: [],
        transactionDate: "2026-01-06",
      },
      household.context
    );
    const receipt = await uploadReceipt(household);
    await call(
      appRouter.attachments.attach,
      { fileId: receipt.fileId, transactionId: transaction.id },
      household.context
    );

    for (const transactionId of [transaction.id, other.id]) {
      expect(
        await codeOf(
          call(
            appRouter.attachments.attach,
            { fileId: receipt.fileId, transactionId },
            household.context
          )
        )
      ).toBe("CONFLICT");
    }
    expect(await linkRows(receipt.fileId)).toHaveLength(1);
  });

  it("refuses a CSV import's source file, which removal would delete", async () => {
    const household = await signUpHousehold();
    const { account, transaction } = await createExpense(household);
    const source = await uploadReceipt(household, { name: "statement.csv" });
    const groceries = await groceriesFor(household.organizationId);
    await getTestDb().insert(transactionImport).values({
      accountId: account.id,
      defaultExpenseCategoryId: groceries,
      defaultIncomeCategoryId: groceries,
      fileName: "statement.csv",
      mapping: {},
      openingBalanceMode: "reject",
      organizationId: household.organizationId,
      sourceFileId: source.fileId,
      status: "ready",
    });

    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: source.fileId, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("CONFLICT");
  });

  it("refuses transfers and archived transactions", async () => {
    const household = await signUpHousehold();
    const { account, transaction } = await createExpense(household);
    const savings = await call(
      appRouter.accounts.create,
      { ...accountInput, name: "Savings" },
      household.context
    );
    const transfer = await call(
      appRouter.transfers.create,
      {
        destinationAccountId: savings.id,
        destinationAmount: "50",
        sourceAccountId: account.id,
        sourceAmount: "50",
        transactionDate: "2026-01-07",
      },
      household.context
    );
    const [posting] = await getTestDb()
      .select({ id: financialTransaction.id })
      .from(financialTransaction)
      .where(eq(financialTransaction.transferId, transfer.id))
      .limit(1);
    if (!posting) {
      throw new Error("Transfer created no postings");
    }
    await call(
      appRouter.transactions.archive,
      { transactionId: transaction.id },
      household.context
    );
    const receipt = await uploadReceipt(household);

    for (const transactionId of [posting.id, transaction.id]) {
      expect(
        await codeOf(
          call(
            appRouter.attachments.attach,
            { fileId: receipt.fileId, transactionId },
            household.context
          )
        )
      ).toBe("BAD_REQUEST");
    }
    expect(await linkRows(receipt.fileId)).toHaveLength(0);
  });

  it(`caps a transaction at ${MAX_ATTACHMENTS_PER_TRANSACTION} attachments`, async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const seeded = await getTestDb()
      .insert(file)
      .values(
        Array.from({ length: MAX_ATTACHMENTS_PER_TRANSACTION }, (_, index) => ({
          bucket: "test-bucket",
          contentType: "application/pdf",
          key: `org/${household.organizationId}/seed-${index}/receipt.pdf`,
          name: "receipt.pdf",
          organizationId: household.organizationId,
          status: "ready" as const,
          userId: household.userId,
        }))
      )
      .returning({ id: file.id });
    await getTestDb()
      .insert(financialTransactionAttachment)
      .values(
        seeded.map(({ id }) => ({ fileId: id, transactionId: transaction.id }))
      );
    const receipt = await uploadReceipt(household);

    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: receipt.fileId, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("BAD_REQUEST");
  });
});

describe("household isolation", () => {
  it("refuses to link another household's file, even to a caller's own transaction", async () => {
    const owner = await signUpHousehold();
    const stranger = await signUpHousehold();
    const { transaction } = await createExpense(stranger);
    const foreignFile = await uploadReceipt(owner);

    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: foreignFile.fileId, transactionId: transaction.id },
          stranger.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(await linkRows(foreignFile.fileId)).toHaveLength(0);
  });

  it("refuses to link a caller's file to another household's transaction", async () => {
    const owner = await signUpHousehold();
    const stranger = await signUpHousehold();
    const { transaction } = await createExpense(owner);
    const strangerFile = await uploadReceipt(stranger);

    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: strangerFile.fileId, transactionId: transaction.id },
          stranger.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(await linkRows(strangerFile.fileId)).toHaveLength(0);
  });

  it("hides another household's attachments from list, download and remove", async () => {
    const owner = await signUpHousehold();
    const stranger = await signUpHousehold();
    const { transaction } = await createExpense(owner);
    const receipt = await uploadReceipt(owner);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, owner.context);

    expect(
      await codeOf(
        call(
          appRouter.attachments.list,
          { transactionId: transaction.id },
          stranger.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(
        call(appRouter.attachments.downloadUrl, input, stranger.context)
      )
    ).toBe("NOT_FOUND");
    expect(
      await codeOf(call(appRouter.attachments.remove, input, stranger.context))
    ).toBe("NOT_FOUND");
    expect(await linkRows(receipt.fileId)).toHaveLength(1);
    expect(bucket.objects.has(receipt.key)).toBe(true);
  });
});

describe("attachments.downloadUrl", () => {
  it("presigns a download for an attached file", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const receipt = await uploadReceipt(household);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, household.context);

    const { downloadUrl } = await call(
      appRouter.attachments.downloadUrl,
      input,
      household.context
    );

    expect(downloadUrl).toContain(receipt.key);
  });

  it("refuses a file that is no longer ready", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const receipt = await uploadReceipt(household);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, household.context);
    // A re-confirm after the object vanished flips the row to failed.
    bucket.objects.delete(receipt.key);
    await caught(
      call(
        appRouter.files.confirmUpload,
        { fileId: receipt.fileId },
        household.context
      )
    );

    expect(
      await codeOf(
        call(appRouter.attachments.downloadUrl, input, household.context)
      )
    ).toBe("CONFLICT");
  });

  it("answers NOT_FOUND for a household file that is not attached to that transaction", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const loose = await uploadReceipt(household);

    expect(
      await codeOf(
        call(
          appRouter.attachments.downloadUrl,
          { fileId: loose.fileId, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("NOT_FOUND");
  });
});

describe("attachments.remove", () => {
  it("deletes the link, the file row and the object", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const receipt = await uploadReceipt(household);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, household.context);

    await expect(
      call(appRouter.attachments.remove, input, household.context)
    ).resolves.toEqual({ fileId: receipt.fileId });

    expect(await linkRows(receipt.fileId)).toHaveLength(0);
    expect(await fileRows(receipt.fileId)).toHaveLength(0);
    expect(bucket.objects.has(receipt.key)).toBe(false);
    expect(
      await call(
        appRouter.attachments.list,
        { transactionId: transaction.id },
        household.context
      )
    ).toEqual([]);
    expect(
      await codeOf(
        call(appRouter.attachments.downloadUrl, input, household.context)
      )
    ).toBe("NOT_FOUND");
  });

  it("refuses a file that is not attached to that transaction and leaves it alone", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const loose = await uploadReceipt(household);

    expect(
      await codeOf(
        call(
          appRouter.attachments.remove,
          { fileId: loose.fileId, transactionId: transaction.id },
          household.context
        )
      )
    ).toBe("NOT_FOUND");
    expect(await fileRows(loose.fileId)).toHaveLength(1);
  });

  it("leaves an archived transaction's attachments readable but unchangeable", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const receipt = await uploadReceipt(household);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, household.context);
    await call(
      appRouter.transactions.archive,
      { transactionId: transaction.id },
      household.context
    );

    expect(
      await codeOf(call(appRouter.attachments.remove, input, household.context))
    ).toBe("BAD_REQUEST");
    expect(
      await call(
        appRouter.attachments.list,
        { transactionId: transaction.id },
        household.context
      )
    ).toHaveLength(1);
  });

  it("drops the link when the file is deleted through the files router", async () => {
    const household = await signUpHousehold();
    const { transaction } = await createExpense(household);
    const receipt = await uploadReceipt(household);
    await call(
      appRouter.attachments.attach,
      { fileId: receipt.fileId, transactionId: transaction.id },
      household.context
    );

    await call(
      appRouter.files.deleteFile,
      { fileId: receipt.fileId },
      household.context
    );

    expect(await linkRows(receipt.fileId)).toHaveLength(0);
    expect(
      await call(
        appRouter.attachments.list,
        { transactionId: transaction.id },
        household.context
      )
    ).toEqual([]);
  });
});

describe("authorization", () => {
  it("lets a viewer list and download but not attach or remove", async () => {
    const owner = await signUpHousehold();
    const viewer = await joinAs(owner, "viewer");
    const { transaction } = await createExpense(owner);
    const receipt = await uploadReceipt(owner);
    const input = { fileId: receipt.fileId, transactionId: transaction.id };
    await call(appRouter.attachments.attach, input, owner.context);
    const another = await uploadReceipt(owner, { name: "invoice.pdf" });

    await expect(
      call(
        appRouter.attachments.list,
        { transactionId: transaction.id },
        viewer.context
      )
    ).resolves.toHaveLength(1);
    await expect(
      call(appRouter.attachments.downloadUrl, input, viewer.context)
    ).resolves.toMatchObject({ downloadUrl: expect.any(String) });
    expect(
      await codeOf(
        call(
          appRouter.attachments.attach,
          { fileId: another.fileId, transactionId: transaction.id },
          viewer.context
        )
      )
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(call(appRouter.attachments.remove, input, viewer.context))
    ).toBe("FORBIDDEN");
    expect(await linkRows(receipt.fileId)).toHaveLength(1);
  });

  it("lets a member remove their own attachment but not someone else's", async () => {
    const owner = await signUpHousehold();
    const memberHousehold = await joinAs(owner, "member");
    const { transaction } = await createExpense(owner);
    const ownersReceipt = await uploadReceipt(owner);
    const membersReceipt = await uploadReceipt(memberHousehold);
    const ownersInput = {
      fileId: ownersReceipt.fileId,
      transactionId: transaction.id,
    };
    const membersInput = {
      fileId: membersReceipt.fileId,
      transactionId: transaction.id,
    };
    await call(appRouter.attachments.attach, ownersInput, owner.context);
    await call(
      appRouter.attachments.attach,
      membersInput,
      memberHousehold.context
    );

    expect(
      await codeOf(
        call(appRouter.attachments.remove, ownersInput, memberHousehold.context)
      )
    ).toBe("FORBIDDEN");
    expect(await linkRows(ownersReceipt.fileId)).toHaveLength(1);
    expect(bucket.objects.has(ownersReceipt.key)).toBe(true);

    await call(
      appRouter.attachments.remove,
      membersInput,
      memberHousehold.context
    );
    expect(await fileRows(membersReceipt.fileId)).toHaveLength(0);
  });

  it("lets an owner remove a member's attachment through delete:any", async () => {
    const owner = await signUpHousehold();
    const memberHousehold = await joinAs(owner, "member");
    const { transaction } = await createExpense(owner);
    const membersReceipt = await uploadReceipt(memberHousehold);
    const input = {
      fileId: membersReceipt.fileId,
      transactionId: transaction.id,
    };
    await call(appRouter.attachments.attach, input, memberHousehold.context);

    await call(appRouter.attachments.remove, input, owner.context);

    expect(await fileRows(membersReceipt.fileId)).toHaveLength(0);
    expect(bucket.objects.has(membersReceipt.key)).toBe(false);
  });
});
