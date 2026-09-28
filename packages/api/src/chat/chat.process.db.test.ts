import {
  chatInboundMessage,
  chatLink,
  chatLinkCode,
  financialTransaction,
  member,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { call } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { accountsRouter } from "../accounts/accounts.router";
import type * as GatewayModule from "../ai/gateway";
import type { Context } from "../context";
import { ai } from "../transactions/quick-entry.golden";
import type * as ChannelsModule from "./chat.channels";
import { processChatMessage } from "./chat.process";
import type { ChatJob } from "./chat.process";
import { chatRouter } from "./chat.router";

const completeJson = vi.hoisted(() => vi.fn());
const isAiConfigured = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());

// The gateway and the flag are the only fakes: linking, parsing and create are real.
vi.mock("../ai/gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  completeJson,
  isAiConfigured,
}));
vi.mock("../feature-flags/feature-flags.cache", () => ({ isFeatureEnabled }));
// Status lists configured channels only.
vi.mock("./chat.channels", async (importOriginal) => ({
  ...(await importOriginal<typeof ChannelsModule>()),
  configuredChatChannels: () => ["telegram"],
}));

const APP_URL = "https://masdan.example";
const TEXT = "dinner at jollibee 400 metrobank mc";
const DINNER = ai({
  account: "metrobank mc",
  amount: "400",
  category: "Food & Dining",
  kind: "expense",
});

let nextMessageId = 1;
let nextSenderId = 5_000_000_000;

const contextFor = async (headers: Headers): Promise<Context> =>
  ({
    auth: null,
    db: getTestDb(),
    log: undefined,
    session: await getSessionFor(headers),
  }) as unknown as Context;

/** A signed-up household with the ticket's card, and a chat account of its own. */
const household = async () => {
  const user = await signUpTestUser();
  const context = { context: await contextFor(user.headers) };
  const current = await getSessionFor(user.headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
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
      name: "Metrobank Titanium",
      openingBalance: "0",
      openingBalanceDate: "2026-01-01",
      ownerMemberIds: [],
    },
    context
  );
  nextSenderId += 1;
  return {
    card,
    context,
    organizationId,
    senderId: String(nextSenderId),
    userId: user.user.id,
  };
};

type Household = Awaited<ReturnType<typeof household>>;

/** What the receive half would have done: record the message, then hand over the job. */
const job = async (
  home: Pick<Household, "senderId">,
  command: ChatJob["command"]
): Promise<ChatJob> => {
  nextMessageId += 1;
  const messageId = String(nextMessageId);
  await getTestDb()
    .insert(chatInboundMessage)
    .values({ channel: "telegram", messageId });
  return {
    channel: "telegram",
    command,
    conversationId: home.senderId,
    messageId,
    sender: { id: home.senderId, name: "@mj" },
  };
};

const send = async (
  home: Pick<Household, "senderId">,
  command: ChatJob["command"]
) => processChatMessage(getTestDb(), await job(home, command), APP_URL);

const link = async (home: Household): Promise<string | null> => {
  const { code } = await call(
    chatRouter.createLinkCode,
    undefined,
    home.context
  );
  return send(home, { code, type: "link" });
};

const transactionCount = async (organizationId: string): Promise<number> => {
  const [row] = await getTestDb()
    .select({ total: count() })
    .from(financialTransaction)
    .where(eq(financialTransaction.organizationId, organizationId));
  return row?.total ?? 0;
};

const setRole = (home: Household, role: string) =>
  getTestDb()
    .update(member)
    .set({ role })
    .where(
      and(
        eq(member.userId, home.userId),
        eq(member.organizationId, home.organizationId)
      )
    );

beforeEach(() => {
  completeJson.mockReset().mockResolvedValue(DINNER);
  isAiConfigured.mockReset().mockReturnValue(true);
  isFeatureEnabled.mockReset().mockResolvedValue(true);
});

describe("linking", () => {
  it("binds the chat account to the user and the household the code was made in", async () => {
    const home = await household();

    const reply = await link(home);

    expect(reply).toMatch(/^Linked to /u);
    const [row] = await getTestDb()
      .select()
      .from(chatLink)
      .where(eq(chatLink.externalUserId, home.senderId));
    expect(row).toMatchObject({
      channel: "telegram",
      externalName: "@mj",
      organizationId: home.organizationId,
      userId: home.userId,
    });
    const status = await call(chatRouter.status, undefined, home.context);
    expect(status.channels).toEqual([
      {
        channel: "telegram",
        label: "Telegram",
        link: expect.objectContaining({ externalName: "@mj" }),
      },
    ]);
  });

  it("stores only the code's hash", async () => {
    const home = await household();
    const { code } = await call(
      chatRouter.createLinkCode,
      undefined,
      home.context
    );

    const rows = await getTestDb()
      .select({ codeHash: chatLinkCode.codeHash })
      .from(chatLinkCode)
      .where(eq(chatLinkCode.userId, home.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).not.toContain(code.replace("-", ""));
  });

  it("works once", async () => {
    const home = await household();
    const stranger = { senderId: `${home.senderId}9` };
    const { code } = await call(
      chatRouter.createLinkCode,
      undefined,
      home.context
    );

    expect(await send(home, { code, type: "link" })).toMatch(/^Linked/u);
    expect(await send(stranger, { code, type: "link" })).toMatch(
      /didn’t work/u
    );
    const [row] = await getTestDb()
      .select({ total: count() })
      .from(chatLink)
      .where(eq(chatLink.externalUserId, stranger.senderId));
    expect(row?.total).toBe(0);
  });

  it("refuses an expired code", async () => {
    const home = await household();
    const { code } = await call(
      chatRouter.createLinkCode,
      undefined,
      home.context
    );
    await getTestDb()
      .update(chatLinkCode)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(chatLinkCode.userId, home.userId));

    expect(await send(home, { code, type: "link" })).toMatch(/didn’t work/u);
  });

  it("refuses a code replaced by a newer one", async () => {
    const home = await household();
    const { code: first } = await call(
      chatRouter.createLinkCode,
      undefined,
      home.context
    );
    await call(chatRouter.createLinkCode, undefined, home.context);

    expect(await send(home, { code: first, type: "link" })).toMatch(
      /didn’t work/u
    );
  });

  it("does not issue codes to members who cannot add transactions", async () => {
    const home = await household();
    await setRole(home, "viewer");

    await expect(
      call(chatRouter.createLinkCode, undefined, home.context)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is hidden while the flag is off", async () => {
    const home = await household();
    isFeatureEnabled.mockResolvedValue(false);

    await expect(
      call(chatRouter.createLinkCode, undefined, home.context)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("can be revoked from Masdan, per channel", async () => {
    const home = await household();
    await link(home);

    expect(
      await call(chatRouter.unlink, { channel: "telegram" }, home.context)
    ).toEqual({ unlinked: true });

    expect(await send(home, { text: TEXT, type: "entry" })).toMatch(
      /isn’t linked/u
    );
    expect(await transactionCount(home.organizationId)).toBe(0);
  });
});

describe("messages", () => {
  it("creates a complete entry through the quick-entry pipeline and confirms it", async () => {
    const home = await household();
    await link(home);

    const entry = await job(home, { text: TEXT, type: "entry" });
    const reply = await processChatMessage(getTestDb(), entry, APP_URL);

    expect(reply).toBe(
      "Added ₱400 expense\nDinner at jollibee\nMetrobank Titanium"
    );
    const [created] = await getTestDb()
      .select()
      .from(financialTransaction)
      .where(eq(financialTransaction.organizationId, home.organizationId));
    expect(created).toMatchObject({
      accountId: home.card.id,
      amount: "400.000000",
      currencyCode: "PHP",
    });
    const [inbound] = await getTestDb()
      .select()
      .from(chatInboundMessage)
      .where(eq(chatInboundMessage.messageId, entry.messageId));
    expect(inbound?.processedAt).not.toBeNull();
    expect(inbound?.transactionId).toBe(created?.id);
    // Names reach the model, never identifiers.
    expect(JSON.stringify(completeJson.mock.calls[0])).not.toContain(
      home.card.id
    );
  });

  it("creates once however often the job is delivered", async () => {
    const home = await household();
    await link(home);
    const entry = await job(home, { text: TEXT, type: "entry" });

    const first = await processChatMessage(getTestDb(), entry, APP_URL);
    const second = await processChatMessage(getTestDb(), entry, APP_URL);

    expect(first).toMatch(/^Added/u);
    expect(second).toBeNull();
    expect(await transactionCount(home.organizationId)).toBe(1);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it("only ever adds to the linked household", async () => {
    const home = await household();
    const other = await household();
    await link(home);

    await send(home, { text: TEXT, type: "entry" });

    expect(await transactionCount(home.organizationId)).toBe(1);
    expect(await transactionCount(other.organizationId)).toBe(0);
  });

  it("does not create an ambiguous entry, and says why with a link to finish it", async () => {
    const home = await household();
    await link(home);
    completeJson.mockResolvedValue(
      ai({ account: "metrobank mc", amount: "400", kind: "expense" })
    );

    const reply = await send(home, { text: TEXT, type: "entry" });

    expect(reply).toMatch(/^Nothing was added yet:\n• /u);
    expect(reply).toContain(
      `Finish it in Masdan: ${APP_URL}/transactions?quickEntry=dinner+at+jollibee+400+metrobank+mc`
    );
    expect(await transactionCount(home.organizationId)).toBe(0);
  });

  it.each([
    ["an error", () => completeJson.mockRejectedValue(new Error("503"))],
    [
      "a timeout",
      () =>
        completeJson.mockRejectedValue(
          new DOMException("The operation timed out", "TimeoutError")
        ),
    ],
    ["no AI configured", () => isAiConfigured.mockReturnValue(false)],
  ])("creates nothing on %s", async (_, fail) => {
    const home = await household();
    await link(home);
    fail();

    const reply = await send(home, { text: TEXT, type: "entry" });

    expect(reply).toMatch(/^I couldn’t read that right now/u);
    expect(reply).toContain(`${APP_URL}/transactions?quickEntry=`);
    expect(await transactionCount(home.organizationId)).toBe(0);
  });

  it("rejects an unlinked account without reading the message", async () => {
    const home = await household();

    expect(await send(home, { text: TEXT, type: "entry" })).toMatch(
      /isn’t linked/u
    );
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("stops a member removed from the household after linking", async () => {
    const home = await household();
    await link(home);
    await getTestDb()
      .delete(member)
      .where(
        and(
          eq(member.userId, home.userId),
          eq(member.organizationId, home.organizationId)
        )
      );

    expect(await send(home, { text: TEXT, type: "entry" })).toMatch(
      /can no longer add/u
    );
    expect(completeJson).not.toHaveBeenCalled();
    expect(await transactionCount(home.organizationId)).toBe(0);
  });

  it("stops a member demoted to viewer after linking", async () => {
    const home = await household();
    await link(home);
    await setRole(home, "viewer");

    expect(await send(home, { text: TEXT, type: "entry" })).toMatch(
      /can no longer add/u
    );
    expect(await transactionCount(home.organizationId)).toBe(0);
  });

  it("refuses overlong text before any model call", async () => {
    const home = await household();
    await link(home);

    expect(await send(home, { text: "x".repeat(301), type: "entry" })).toMatch(
      /^Keep it to 300 characters/u
    );
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("does nothing while the flag is off", async () => {
    const home = await household();
    await link(home);
    isFeatureEnabled.mockResolvedValue(false);

    expect(await send(home, { text: TEXT, type: "entry" })).toBeNull();
    expect(await transactionCount(home.organizationId)).toBe(0);
  });
});
