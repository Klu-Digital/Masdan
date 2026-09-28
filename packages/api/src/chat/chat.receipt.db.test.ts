import {
  chatInboundMessage,
  file,
  financialTransaction,
  financialTransactionAttachment,
  member,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type { Context } from "../context";
import { processChatMessage } from "./chat.process";
import type { ChatJob } from "./chat.process";
import { chatRouter } from "./chat.router";

const completeJson = vi.hoisted(() => vi.fn());
const isAiConfigured = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());
const putObject = vi.hoisted(() => vi.fn());
const deleteObject = vi.hoisted(() => vi.fn());
const storageState = vi.hoisted(() => ({ bucketFails: false }));
vi.mock("../ai/gateway", () => ({ completeJson, isAiConfigured }));
vi.mock("../feature-flags/feature-flags.cache", () => ({ isFeatureEnabled }));
vi.mock("@masdan/storage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  storage: {
    get bucket() {
      if (storageState.bucketFails) {
        throw new Error("Bucket unavailable");
      }
      return "test-bucket";
    },
    deleteObject,
    isConfigured: () => true,
    putObject,
  },
}));

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2]);
const download = vi.fn(() => Promise.resolve(bytes));
const extraction = {
  cardLastFour: "4821",
  category: "Food & Dining",
  currency: "PHP",
  date: null,
  details: null,
  isReceipt: true,
  kind: "expense",
  merchant: "Jollibee",
  totals: ["400"],
};
let nextId = 300_000;
const db = getTestDb;
const home = async () => {
  const user = await signUpTestUser();
  const session = await getSessionFor(user.headers);
  const organizationId = session?.session.activeOrganizationId ?? "";
  const context = {
    context: {
      auth: null,
      db: db(),
      log: undefined,
      session,
    } as unknown as Context,
  };
  const card = await call(
    accountsRouter.create,
    {
      accountClass: "liability",
      accountType: "credit_card",
      cardLastFour: "4821",
      cardNetwork: "Mastercard",
      creditLimit: "100000",
      institution: "Metrobank",
      liquidity: null,
      name: "Metrobank MC",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  const { code } = await call(chatRouter.createLinkCode, undefined, context);
  nextId += 1;
  const senderId = String(nextId);
  nextId += 1;
  const messageId = String(nextId);
  await db()
    .insert(chatInboundMessage)
    .values({ channel: "telegram", messageId });
  await processChatMessage(
    db(),
    {
      channel: "telegram",
      command: { code, type: "link" },
      conversationId: senderId,
      messageId,
      sender: { id: senderId, name: null },
    },
    null
  );
  return { card, context, organizationId, senderId, userId: user.user.id };
};
const job = async (
  senderId: string,
  caption: string | null = null
): Promise<ChatJob> => {
  nextId += 1;
  const messageId = String(nextId);
  await db()
    .insert(chatInboundMessage)
    .values({ channel: "telegram", messageId });
  return {
    channel: "telegram",
    command: {
      caption,
      file: {
        contentType: "image/jpeg",
        name: "original.jpg",
        ref: "telegram-ref",
        size: bytes.length,
      },
      type: "receipt",
    },
    conversationId: senderId,
    messageId,
    sender: { id: senderId, name: null },
  };
};
const process = (entry: ChatJob) =>
  processChatMessage(db(), entry, "https://masdan.example", download);
const totals = async () => {
  const [transactions] = await db()
    .select({ n: count() })
    .from(financialTransaction);
  const [files] = await db().select({ n: count() }).from(file);
  const [links] = await db()
    .select({ n: count() })
    .from(financialTransactionAttachment);
  return [transactions?.n ?? 0, files?.n ?? 0, links?.n ?? 0];
};

beforeEach(() => {
  completeJson.mockReset().mockResolvedValue(extraction);
  isAiConfigured.mockReset().mockReturnValue(true);
  isFeatureEnabled.mockReset().mockResolvedValue(true);
  putObject.mockReset().mockResolvedValue();
  deleteObject.mockReset().mockResolvedValue();
  download.mockReset().mockResolvedValue(bytes);
  storageState.bucketFails = false;
});

describe("chat receipt worker", () => {
  it("creates a transaction with the original bytes and a ready same-household attachment", async () => {
    const household = await home();
    const reply = await process(await job(household.senderId));
    expect(reply).toContain("Receipt attached");
    expect(await totals()).toEqual([1, 1, 1]);
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({ body: bytes, contentType: "image/jpeg" })
    );
    const [record] = await db().select().from(file);
    const [created] = await db().select().from(financialTransaction);
    const [attachment] = await db()
      .select()
      .from(financialTransactionAttachment);
    expect(record).toMatchObject({
      organizationId: household.organizationId,
      size: bytes.length,
      status: "ready",
      userId: household.userId,
    });
    expect(attachment).toMatchObject({
      fileId: record?.id,
      transactionId: created?.id,
    });
    expect(created?.accountId).toBe(household.card.id);
    expect(JSON.stringify(completeJson.mock.calls)).not.toContain(
      household.card.id
    );
  });

  it("resolves an account named in the caption", async () => {
    const household = await home();
    completeJson.mockResolvedValue({ ...extraction, cardLastFour: null });
    expect(
      await process(await job(household.senderId, "metrobank mc"))
    ).toContain("Receipt attached");
    expect(await totals()).toEqual([1, 1, 1]);
  });

  it.each([
    ["ambiguous totals", { totals: ["400", "500"] }],
    ["missing account", { cardLastFour: null }],
  ])("creates nothing for %s", async (_, override) => {
    const household = await home();
    if ("cardLastFour" in override) {
      await call(
        accountsRouter.create,
        {
          accountClass: "asset",
          accountType: "cash",
          cardLastFour: null,
          cardNetwork: null,
          creditLimit: null,
          institution: null,
          liquidity: "liquid",
          name: "Cash",
          openingBalance: "0",
          openingBalanceDate: "2026-01-01",
          ownerMemberIds: [],
        },
        household.context
      );
    }
    completeJson.mockResolvedValue({ ...extraction, ...override });
    expect(await process(await job(household.senderId))).not.toContain(
      "Receipt attached"
    );
    expect(await totals()).toEqual([0, 0, 0]);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects unsupported magic bytes", async () => {
    const household = await home();
    download.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect(await process(await job(household.senderId))).toMatch(
      /PDFs aren’t supported/u
    );
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("rejects oversized downloaded bytes", async () => {
    const household = await home();
    download.mockResolvedValue(new Uint8Array(26_214_401));
    expect(await process(await job(household.senderId))).toMatch(/too large/u);
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("handles a failed download", async () => {
    const household = await home();
    download.mockRejectedValue(new Error("download failed"));
    expect(await process(await job(household.senderId))).toMatch(
      /couldn’t download/u
    );
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("handles failed extraction", async () => {
    const household = await home();
    completeJson.mockRejectedValue(new Error("AI unavailable"));
    expect(await process(await job(household.senderId))).toMatch(
      /couldn’t read/u
    );
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("requires both transaction and file create permissions", async () => {
    const household = await home();
    await db()
      .update(member)
      .set({ role: "viewer" })
      .where(
        and(
          eq(member.userId, household.userId),
          eq(member.organizationId, household.organizationId)
        )
      );
    expect(await process(await job(household.senderId))).toMatch(
      /can no longer add/u
    );
    expect(download).not.toHaveBeenCalled();
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("rejects unlinked senders", async () => {
    expect(await process(await job("unknown"))).toMatch(/isn’t linked/u);
    expect(download).not.toHaveBeenCalled();
  });
  it("does not duplicate transactions or attachments", async () => {
    const household = await home();
    const entry = await job(household.senderId);
    expect(await process(entry)).toContain("Receipt attached");
    expect(await process(entry)).toBeNull();
    expect(await totals()).toEqual([1, 1, 1]);
    expect(putObject).toHaveBeenCalledTimes(1);
  });
  it("creates nothing when upload fails", async () => {
    const household = await home();
    putObject.mockRejectedValue(new Error("S3 down"));
    expect(await process(await job(household.senderId))).toMatch(
      /couldn’t attach/u
    );
    expect(await totals()).toEqual([0, 0, 0]);
  });
  it("deletes an uploaded object if the database transaction fails", async () => {
    const household = await home();
    storageState.bucketFails = true;
    await expect(process(await job(household.senderId))).rejects.toThrow(
      "Bucket unavailable"
    );
    expect(await totals()).toEqual([0, 0, 0]);
    expect(deleteObject).toHaveBeenCalledWith({ key: expect.any(String) });
  });
});
