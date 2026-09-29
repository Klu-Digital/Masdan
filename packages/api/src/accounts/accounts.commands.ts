import { cardCatalog } from "@masdan/card-catalog/all";
import type { Database } from "@masdan/db";
import {
  creditCardStatement,
  currency,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountOwner,
  financialTransaction,
  member,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

import { enqueueReminderRefresh } from "../reminders/reminders.commands";
import { notFound } from "../shared/errors";
import { householdSettings } from "../shared/household";
import { findOwned } from "../shared/ownership";
import {
  accountFields,
  creditMetrics,
  requireCreditCard,
  statementFields,
  withBalance,
} from "./accounts.queries";
import type { AccountValues, SnapshotValues, StatementValues } from "./schema";

const cardMetadata = (values: AccountValues) =>
  values.accountType === "credit_card"
    ? {
        cardLastFour: values.cardLastFour ?? null,
        cardNetwork: values.cardNetwork ?? null,
        cardProductKey: values.cardProductKey ?? null,
        creditLimit: values.creditLimit ?? null,
        paymentDueDay: values.paymentDueDay ?? null,
        statementClosingDay: values.statementClosingDay ?? null,
      }
    : {
        cardLastFour: null,
        cardNetwork: null,
        cardProductKey: null,
        creditLimit: null,
        paymentDueDay: null,
        statementClosingDay: null,
      };

const assertCardProduct = (
  metadata: ReturnType<typeof cardMetadata>,
  institution: string | null | undefined,
  savedProductKey: string | null
): void => {
  const issue = cardCatalog.productIssue(
    { ...metadata, institution },
    savedProductKey
  );
  if (issue) {
    throw new ORPCError("BAD_REQUEST", { message: issue });
  }
};

const validateOwners = async (
  db: Database,
  organizationId: string,
  ownerMemberIds: string[]
): Promise<void> => {
  if (ownerMemberIds.length === 0) {
    return;
  }

  const owners = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.id, ownerMemberIds)
      )
    );

  if (owners.length !== ownerMemberIds.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Every account owner must belong to the active household",
    });
  }
};

const replaceOwners = async (
  db: Database,
  organizationId: string,
  accountId: string,
  ownerMemberIds: string[]
): Promise<void> => {
  await db
    .delete(financialAccountOwner)
    .where(eq(financialAccountOwner.financialAccountId, accountId));
  if (ownerMemberIds.length > 0) {
    await db.insert(financialAccountOwner).values(
      ownerMemberIds.map((memberId) => ({
        financialAccountId: accountId,
        memberId,
        organizationId,
      }))
    );
  }
};

/** Class, type and currency are frozen once postings, statements or snapshots exist. */
const hasFinancialHistory = async (
  db: Database,
  accountId: string
): Promise<boolean> => {
  const postings = await db
    .select({ id: financialTransaction.id })
    .from(financialTransaction)
    .where(eq(financialTransaction.accountId, accountId))
    .limit(1);
  if (postings.length) {
    return true;
  }
  const statements = await db
    .select({ id: creditCardStatement.id })
    .from(creditCardStatement)
    .where(eq(creditCardStatement.accountId, accountId))
    .limit(1);
  if (statements.length) {
    return true;
  }
  const snapshots = await db
    .select({ id: financialAccountBalanceSnapshot.id })
    .from(financialAccountBalanceSnapshot)
    .where(eq(financialAccountBalanceSnapshot.accountId, accountId))
    .limit(1);
  return snapshots.length > 0;
};

export const createAccount = async (
  db: Database,
  organizationId: string,
  input: AccountValues
) => {
  await validateOwners(db, organizationId, input.ownerMemberIds);

  const household = input.currencyCode
    ? null
    : await householdSettings(db, organizationId);
  const currencyCode = input.currencyCode ?? household?.defaultCurrency ?? "";

  const [selectedCurrency] = await db
    .select({ code: currency.code })
    .from(currency)
    .where(and(eq(currency.code, currencyCode), eq(currency.enabled, true)))
    .limit(1);
  if (!selectedCurrency) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unknown currency ${currencyCode}`,
    });
  }

  const card = cardMetadata(input);
  assertCardProduct(card, input.institution, null);

  const { ownerMemberIds, currencyCode: _, ...values } = input;
  const [created] = await db
    .insert(financialAccount)
    .values({
      ...values,
      ...card,
      currencyCode: selectedCurrency.code,
      organizationId,
    })
    .returning(accountFields);

  if (!created) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not create financial account",
    });
  }

  await replaceOwners(db, organizationId, created.id, ownerMemberIds);
  if (created.accountType === "credit_card") {
    await enqueueReminderRefresh(db, organizationId);
  }

  return {
    ...created,
    balance: created.openingBalance,
    ...creditMetrics(created, created.openingBalance),
    ownerMemberIds,
  };
};

export const updateAccount = async (
  db: Database,
  organizationId: string,
  input: AccountValues & { accountId: string }
) => {
  await validateOwners(db, organizationId, input.ownerMemberIds);

  const {
    accountId,
    ownerMemberIds,
    currencyCode: requestedCurrency,
    ...values
  } = input;
  const existing = await findOwned(
    db,
    financialAccount,
    { id: accountId, organizationId },
    "Financial account"
  );
  const card = cardMetadata(input);
  assertCardProduct(card, input.institution, existing.cardProductKey);

  const currencyCode = requestedCurrency ?? existing.currencyCode;
  const [selectedCurrency] = await db
    .select({ code: currency.code, enabled: currency.enabled })
    .from(currency)
    .where(eq(currency.code, currencyCode))
    .limit(1);
  if (
    !selectedCurrency ||
    (!selectedCurrency.enabled &&
      selectedCurrency.code !== existing.currencyCode)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Unknown currency ${currencyCode}`,
    });
  }

  if (
    (existing.accountClass !== input.accountClass ||
      existing.accountType !== input.accountType ||
      existing.currencyCode !== selectedCurrency.code) &&
    (await hasFinancialHistory(db, accountId))
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Account class, type, and currency cannot change after financial history exists",
    });
  }

  const [updated] = await db
    .update(financialAccount)
    .set({
      ...values,
      ...card,
      currencyCode: selectedCurrency.code,
    })
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .returning(accountFields);
  if (!updated) {
    throw notFound("Financial account");
  }

  await replaceOwners(db, organizationId, accountId, ownerMemberIds);
  if (updated.accountType === "credit_card") {
    await enqueueReminderRefresh(db, organizationId);
  }

  return {
    ...(await withBalance(db, organizationId, updated)),
    ownerMemberIds,
  };
};

/** Archive (a date) or restore (`null`); a restored card's reminders come back. */
export const setAccountArchived = async (
  db: Database,
  organizationId: string,
  accountId: string,
  archivedAt: Date | null
) => {
  const [row] = await db
    .update(financialAccount)
    .set({ archivedAt })
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .returning(accountFields);

  if (!row) {
    throw notFound("Financial account");
  }
  if (archivedAt === null && row.accountType === "credit_card") {
    await enqueueReminderRefresh(db, organizationId);
  }
  return withBalance(db, organizationId, row);
};

export const createStatement = async (
  db: Database,
  organizationId: string,
  input: StatementValues
) => {
  await requireCreditCard(db, organizationId, input.accountId);

  const [created] = await db
    .insert(creditCardStatement)
    .values({
      ...input,
      dueDate: input.dueDate ?? null,
      minimumAmountDue: input.minimumAmountDue ?? null,
      organizationId,
    })
    .returning(statementFields);
  if (!created) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not create credit card statement",
    });
  }
  await enqueueReminderRefresh(db, organizationId);
  return created;
};

export const saveSnapshot = async (
  db: Database,
  organizationId: string,
  input: SnapshotValues
) => {
  await findOwned(
    db,
    financialAccount,
    { id: input.accountId, organizationId },
    "Financial account"
  );

  const [snapshot] = await db
    .insert(financialAccountBalanceSnapshot)
    .values({ ...input, organizationId })
    .returning();
  if (!snapshot) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not save balance snapshot",
    });
  }
  return snapshot;
};
