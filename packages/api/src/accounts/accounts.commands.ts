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
import {
  fixedAmountText,
  formatScaledAmount,
  signedScaledAmount,
} from "../shared/money";
import { lockOwned } from "../shared/ownership";
import {
  accountFields,
  assertReconciliationDate,
  creditMetrics,
  hasFinancialHistory,
  statementFields,
  withBalance,
} from "./accounts.queries";
import { getAccountBalance } from "./balances";
import type {
  AccountValues,
  ReconciliationValues,
  SnapshotValues,
  StatementValues,
} from "./schema";

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
  // Held to commit, so a posting cannot land between the history check and
  // the class or currency change; postings share-lock the account.
  const existing = await lockOwned(
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
    (signedScaledAmount(existing.openingBalance) !==
      signedScaledAmount(input.openingBalance) ||
      (input.openingBalanceDate !== undefined &&
        existing.openingBalanceDate !== input.openingBalanceDate)) &&
    (await hasFinancialHistory(db, accountId))
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Opening balance and date cannot change after financial history exists. Reconcile the balance instead.",
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
  const account = await lockOwned(
    db,
    financialAccount,
    { id: input.accountId, organizationId },
    "Financial account",
    "share"
  );
  if (account.accountType !== "credit_card") {
    throw notFound("Financial account");
  }

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

export const reconcileBalance = async (
  db: Database,
  organizationId: string,
  input: ReconciliationValues
) => {
  const account = await lockOwned(
    db,
    financialAccount,
    { id: input.accountId, organizationId },
    "Financial account"
  );
  assertReconciliationDate(account, input.effectiveDate);
  const calculatedBalance = await getAccountBalance(
    db,
    organizationId,
    account.id,
    input.effectiveDate
  );
  if (
    signedScaledAmount(calculatedBalance) !==
    signedScaledAmount(input.expectedBalance)
  ) {
    throw new ORPCError("CONFLICT", {
      message:
        "The account balance changed. Review the refreshed adjustment and confirm again.",
    });
  }
  const delta =
    signedScaledAmount(input.balance) - signedScaledAmount(calculatedBalance);
  const [snapshot] = await db
    .insert(financialAccountBalanceSnapshot)
    .values({
      accountId: account.id,
      adjustment: fixedAmountText(delta),
      balance: input.balance,
      effectiveDate: input.effectiveDate,
      notes: input.notes ?? null,
      organizationId,
      source: "reconciliation",
    })
    .returning();
  if (!snapshot) {
    throw new ORPCError("INTERNAL_SERVER_ERROR");
  }
  if (delta !== 0n) {
    await db.insert(financialTransaction).values({
      accountId: account.id,
      adjustmentDirection: delta > 0n ? "increase" : "decrease",
      amount: formatScaledAmount(delta > 0n ? delta : -delta),
      currencyCode: account.currencyCode,
      notes: input.notes ?? null,
      organizationId,
      reconciliationSnapshotId: snapshot.id,
      transactionDate: input.effectiveDate,
    });
  }
  return { adjustment: fixedAmountText(delta), calculatedBalance, snapshot };
};

export const saveSnapshot = async (
  db: Database,
  organizationId: string,
  input: SnapshotValues
) => {
  await lockOwned(
    db,
    financialAccount,
    { id: input.accountId, organizationId },
    "Financial account",
    "share"
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
