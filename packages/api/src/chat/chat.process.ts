import { hasPermission } from "@masdan/auth/permissions";
import type { PermissionRequest } from "@masdan/auth/permissions";
import type { Database } from "@masdan/db";
import {
  chatInboundMessage,
  chatLink,
  chatLinkCode,
  file,
  financialTransactionAttachment,
  financialAccount,
  member,
  organization,
} from "@masdan/db/schema/index";
import type { ChatChannel } from "@masdan/db/schema/index";
import { env } from "@masdan/env/integrations";
import { log, parseError } from "@masdan/observability";
import type { JobPayload } from "@masdan/queue";
import { buildObjectKey, sanitizeFileName, storage } from "@masdan/storage";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { isAiConfigured } from "../ai/gateway";
import { isFeatureEnabled } from "../feature-flags/feature-flags.cache";
import { QUICK_ENTRY_MAX_LENGTH } from "../transactions/quick-entry";
import {
  parseQuickEntryText,
  quickEntryText,
} from "../transactions/quick-entry.parse";
import {
  parseReceiptEntry,
  sniffReceiptContentType,
} from "../transactions/receipt-entry.parse";
import { createTransaction } from "../transactions/transactions.write";
import type { ChatChannelAdapter } from "./chat.channel";
import { hashLinkCode } from "./chat.link";
import { chatReplies, quickEntryLink } from "./chat.replies";

/**
 * Worker-side chat entry, the same for every channel. No procedure ladder: a
 * message carries no session, so the household comes from `chat_link` and
 * every message re-checks what `orgProcedure` and `requirePermission` would.
 */

/** A `chat.process` payload whose channel has been checked against the registry. */
export type ChatJob = JobPayload<"chat.process"> & { channel: ChatChannel };

/** Thrown inside a transaction to roll it back when a repeat delivery lost the claim. */
class AlreadyProcessedError extends Error {
  constructor() {
    super("Chat message already processed");
    this.name = "AlreadyProcessedError";
  }
}

type Executor = Pick<Database, "update">;

/**
 * Marks the message handled. Called in the same transaction as the write it
 * guards, so a retried job either sees it claimed or finds nothing written.
 */
const claimMessage = async (
  db: Executor,
  job: ChatJob,
  transaction: { id: string; organizationId: string } | null = null
): Promise<void> => {
  const [claimed] = await db
    .update(chatInboundMessage)
    .set({
      organizationId: transaction?.organizationId ?? null,
      processedAt: new Date(),
      transactionId: transaction?.id ?? null,
    })
    .where(
      and(
        eq(chatInboundMessage.channel, job.channel),
        eq(chatInboundMessage.messageId, job.messageId),
        isNull(chatInboundMessage.processedAt)
      )
    )
    .returning({ messageId: chatInboundMessage.messageId });
  if (!claimed) {
    throw new AlreadyProcessedError();
  }
};

/**
 * Membership and `transaction:create`, read now rather than at linking, so a
 * member removed or demoted since stops posting into the household.
 */
const TRANSACTION_CREATE: PermissionRequest = { transaction: ["create"] };

const householdAccess = async (
  db: Pick<Database, "select">,
  userId: string,
  organizationId: string,
  permissions: PermissionRequest = TRANSACTION_CREATE
): Promise<{ householdName: string } | null> => {
  const [row] = await db
    .select({ householdName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId))
    )
    .limit(1);
  if (!row || !hasPermission({ permissions, role: row.role })) {
    return null;
  }
  return { householdName: row.householdName };
};

const linkAccount = (
  db: Database,
  job: ChatJob,
  code: string
): Promise<string> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [consumed] = await tx
      .update(chatLinkCode)
      .set({ consumedAt: now })
      .where(
        and(
          eq(chatLinkCode.codeHash, hashLinkCode(code)),
          isNull(chatLinkCode.consumedAt),
          gt(chatLinkCode.expiresAt, now)
        )
      )
      .returning({
        organizationId: chatLinkCode.organizationId,
        userId: chatLinkCode.userId,
      });
    const access = consumed
      ? await householdAccess(tx, consumed.userId, consumed.organizationId)
      : null;
    await claimMessage(tx, job);
    if (!(consumed && access)) {
      log.info({ action: "chat.link.failed", channel: job.channel });
      return chatReplies.linkFailed;
    }

    // One account per channel, user and household: a new one replaces the old.
    await tx
      .delete(chatLink)
      .where(
        and(
          eq(chatLink.channel, job.channel),
          eq(chatLink.userId, consumed.userId),
          eq(chatLink.organizationId, consumed.organizationId),
          ne(chatLink.externalUserId, job.sender.id)
        )
      );
    const values = {
      externalName: job.sender.name,
      organizationId: consumed.organizationId,
      userId: consumed.userId,
    };
    await tx
      .insert(chatLink)
      .values({
        ...values,
        channel: job.channel,
        externalUserId: job.sender.id,
      })
      .onConflictDoUpdate({
        set: { ...values, createdAt: now },
        target: [chatLink.channel, chatLink.externalUserId],
      });
    log.info({
      action: "chat.link.created",
      channel: job.channel,
      organizationId: consumed.organizationId,
      userId: consumed.userId,
    });
    return chatReplies.linked(access.householdName);
  });

const addEntry = async (
  db: Database,
  job: ChatJob,
  appUrl: string | null,
  source: string
): Promise<string> => {
  const [link] = await db
    .select({
      organizationId: chatLink.organizationId,
      userId: chatLink.userId,
    })
    .from(chatLink)
    .where(
      and(
        eq(chatLink.channel, job.channel),
        eq(chatLink.externalUserId, job.sender.id)
      )
    )
    .limit(1);
  if (!link) {
    await claimMessage(db, job);
    return chatReplies.unlinked;
  }
  if (!(await householdAccess(db, link.userId, link.organizationId))) {
    await claimMessage(db, job);
    log.info({
      action: "chat.access.denied",
      channel: job.channel,
      userId: link.userId,
    });
    return chatReplies.noAccess;
  }
  const text = quickEntryText.safeParse(source);
  if (!text.success) {
    await claimMessage(db, job);
    return chatReplies.tooLong;
  }

  // The same pipeline as the web's quick entry; this path parses nothing itself.
  const parsed = await parseQuickEntryText(db, link.organizationId, text.data);
  const deepLink = quickEntryLink(appUrl, text.data);
  if (parsed.ai !== "ok") {
    // Deterministic matching alone never creates here: there is no form to review it in.
    await claimMessage(db, job);
    log.warn({ action: "chat.ai.failed", ai: parsed.ai, channel: job.channel });
    return chatReplies.aiFailed(deepLink);
  }
  const { input } = parsed;
  if (!input) {
    await claimMessage(db, job);
    return chatReplies.needsReview(
      parsed.issues.map((issue) => issue.message),
      deepLink
    );
  }

  try {
    return await db.transaction(async (tx) => {
      const created = await createTransaction(tx, link.organizationId, {
        ...input,
        notes: input.notes ?? null,
        splits: input.splits ?? [],
      });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create transaction",
        });
      }
      await claimMessage(tx, job, {
        id: created.id,
        organizationId: link.organizationId,
      });
      const [account] = await tx
        .select({
          currencyCode: financialAccount.currencyCode,
          name: financialAccount.name,
        })
        .from(financialAccount)
        .where(eq(financialAccount.id, input.accountId))
        .limit(1);
      log.info({
        action: "chat.transaction.created",
        channel: job.channel,
        organizationId: link.organizationId,
        transactionId: created.id,
      });
      return chatReplies.created({
        accountName: account?.name ?? "",
        amount: input.amount,
        currencyCode: account?.currencyCode ?? "PHP",
        kind: parsed.kind,
        notes: input.notes ?? null,
      });
    });
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      throw error;
    }
    // Create's own validation said no, e.g. the account was archived mid-parse.
    await claimMessage(db, job);
    log.warn({
      action: "chat.create.rejected",
      channel: job.channel,
      ...parseError(error),
    });
    return chatReplies.needsReview([error.message], deepLink);
  }
};

export type ChatJobDownload = NonNullable<ChatChannelAdapter["download"]>;

// oxlint-disable-next-line complexity -- Every failure is claimed before the object can be persisted.
const addReceipt = async (
  db: Database,
  job: ChatJob & { command: Extract<ChatJob["command"], { type: "receipt" }> },
  appUrl: string | null,
  download: ChatJobDownload | null
): Promise<string> => {
  const [link] = await db
    .select({
      organizationId: chatLink.organizationId,
      userId: chatLink.userId,
    })
    .from(chatLink)
    .where(
      and(
        eq(chatLink.channel, job.channel),
        eq(chatLink.externalUserId, job.sender.id)
      )
    )
    .limit(1);
  if (!link) {
    await claimMessage(db, job);
    return chatReplies.unlinked;
  }
  if (
    !(await householdAccess(db, link.userId, link.organizationId, {
      attachment: ["create"],
      transaction: ["create"],
    }))
  ) {
    await claimMessage(db, job);
    log.info({
      action: "chat.access.denied",
      channel: job.channel,
      userId: link.userId,
    });
    return chatReplies.noAccess;
  }
  const { caption, file: source } = job.command;
  if ((caption?.length ?? 0) > QUICK_ENTRY_MAX_LENGTH) {
    await claimMessage(db, job);
    return chatReplies.tooLong;
  }
  if (!download || !storage.isConfigured() || !isAiConfigured("receipt")) {
    await claimMessage(db, job);
    return chatReplies.receiptUnavailable;
  }
  let bytes: Uint8Array;
  try {
    bytes = await download(source.ref, env.STORAGE_MAX_UPLOAD_BYTES);
  } catch {
    await claimMessage(db, job);
    log.warn({ action: "chat.receipt.download_failed" });
    return chatReplies.receiptDownloadFailed;
  }
  if (bytes.byteLength > env.STORAGE_MAX_UPLOAD_BYTES) {
    await claimMessage(db, job);
    return chatReplies.receiptTooLarge;
  }
  const contentType = sniffReceiptContentType(bytes);
  if (!contentType) {
    await claimMessage(db, job);
    return chatReplies.receiptUnsupported;
  }
  const parsed = await parseReceiptEntry(
    db,
    link.organizationId,
    { bytes, contentType },
    caption
  );
  if (parsed.ai !== "ok" || !parsed.result) {
    await claimMessage(db, job);
    return parsed.ai === "unavailable"
      ? chatReplies.receiptUnavailable
      : chatReplies.receiptAiFailed;
  }
  const { input, issues, kind, summary } = parsed.result;
  if (!input) {
    await claimMessage(db, job);
    return chatReplies.receiptNeedsReview(summary, issues, appUrl);
  }
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
  const name = sanitizeFileName(source.name ?? `receipt.${extension}`);
  const key = buildObjectKey({
    name,
    objectId: crypto.randomUUID(),
    organizationId: link.organizationId,
  });
  const cleanup = async () => {
    try {
      await storage.deleteObject({ key });
    } catch {
      log.warn({ action: "chat.receipt.cleanup_failed" });
    }
  };
  try {
    await storage.putObject({ body: bytes, contentType, key });
  } catch {
    await cleanup();
    await claimMessage(db, job);
    log.warn({ action: "chat.receipt.attach_failed" });
    return chatReplies.receiptAttachFailed;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const created = await createTransaction(tx, link.organizationId, {
        ...input,
        notes: input.notes ?? null,
        splits: input.splits ?? [],
      });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create transaction",
        });
      }
      const [uploaded] = await tx
        .insert(file)
        .values({
          bucket: storage.bucket,
          contentType,
          key,
          name,
          organizationId: link.organizationId,
          size: bytes.byteLength,
          status: "ready",
          userId: link.userId,
        })
        .returning({ id: file.id });
      if (!uploaded) {
        throw new Error("Could not create receipt file");
      }
      await tx.insert(financialTransactionAttachment).values({
        fileId: uploaded.id,
        organizationId: link.organizationId,
        transactionId: created.id,
      });
      await claimMessage(tx, job, {
        id: created.id,
        organizationId: link.organizationId,
      });
      const [account] = await tx
        .select({
          currencyCode: financialAccount.currencyCode,
          name: financialAccount.name,
        })
        .from(financialAccount)
        .where(eq(financialAccount.id, input.accountId))
        .limit(1);
      return { account, fileId: uploaded.id, transactionId: created.id };
    });
    log.info({
      action: "chat.receipt.created",
      fileId: result.fileId,
      organizationId: link.organizationId,
      transactionId: result.transactionId,
    });
    return chatReplies.receiptCreated({
      accountName: result.account?.name ?? "",
      amount: input.amount,
      currencyCode: result.account?.currencyCode ?? "PHP",
      kind,
      notes: input.notes ?? null,
    });
  } catch (error) {
    await cleanup();
    if (!(error instanceof ORPCError)) {
      throw error;
    }
    await claimMessage(db, job);
    log.warn({
      action: "chat.create.rejected",
      channel: job.channel,
      ...parseError(error),
    });
    return chatReplies.receiptNeedsReview(
      summary,
      [{ field: "amount", message: error.message, reason: "invalid" }],
      appUrl
    );
  }
};

/**
 * Returns the reply to send, or `null` when there is nothing to say: chat entry
 * is off, or a repeat delivery already handled this message. Side effects are
 * committed before the reply is returned, so a failed send never re-creates.
 */
export const processChatMessage = async (
  db: Database,
  job: ChatJob,
  appUrl: string | null,
  download: ChatJobDownload | null = null
): Promise<string | null> => {
  if (!(await isFeatureEnabled(db, "FF__CHAT_ENTRY"))) {
    return null;
  }
  const [inbound] = await db
    .select({ processedAt: chatInboundMessage.processedAt })
    .from(chatInboundMessage)
    .where(
      and(
        eq(chatInboundMessage.channel, job.channel),
        eq(chatInboundMessage.messageId, job.messageId)
      )
    )
    .limit(1);
  if (!inbound || inbound.processedAt) {
    return null;
  }

  try {
    if (job.command.type === "link") {
      return await linkAccount(db, job, job.command.code);
    }
    if (job.command.type === "receipt") {
      return await addReceipt(
        db,
        { ...job, command: job.command },
        appUrl,
        download
      );
    }
    return await addEntry(db, job, appUrl, job.command.text);
  } catch (error) {
    if (error instanceof AlreadyProcessedError) {
      return null;
    }
    throw error;
  }
};
