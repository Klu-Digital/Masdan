import type { Database } from "@masdan/db";
import {
  creditCardStatement,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountOwner,
  financialTransaction,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
} from "drizzle-orm";

import { accountInterestSummary } from "../interest/interest.queries";
import { notFound } from "../shared/errors";
import { fixedAmountText, signedScaledAmount } from "../shared/money";
import { findOwned } from "../shared/ownership";
import { getAccountBalance, getAccountBalances } from "./balances";

export const accountFields = {
  accountClass: financialAccount.accountClass,
  accountType: financialAccount.accountType,
  archivedAt: financialAccount.archivedAt,
  cardLastFour: financialAccount.cardLastFour,
  cardNetwork: financialAccount.cardNetwork,
  cardProductKey: financialAccount.cardProductKey,
  color: financialAccount.color,
  createdAt: financialAccount.createdAt,
  creditLimit: financialAccount.creditLimit,
  currencyCode: financialAccount.currencyCode,
  icon: financialAccount.icon,
  id: financialAccount.id,
  includeInNetWorth: financialAccount.includeInNetWorth,
  institution: financialAccount.institution,
  institutionId: financialAccount.institutionId,
  liquidity: financialAccount.liquidity,
  name: financialAccount.name,
  notes: financialAccount.notes,
  openingBalance: financialAccount.openingBalance,
  openingBalanceDate: financialAccount.openingBalanceDate,
  organizationId: financialAccount.organizationId,
  paymentDueDay: financialAccount.paymentDueDay,
  statementClosingDay: financialAccount.statementClosingDay,
  updatedAt: financialAccount.updatedAt,
};

export const statementFields = {
  accountId: creditCardStatement.accountId,
  createdAt: creditCardStatement.createdAt,
  dueDate: creditCardStatement.dueDate,
  id: creditCardStatement.id,
  minimumAmountDue: creditCardStatement.minimumAmountDue,
  organizationId: creditCardStatement.organizationId,
  periodEnd: creditCardStatement.periodEnd,
  periodStart: creditCardStatement.periodStart,
  statementBalance: creditCardStatement.statementBalance,
  statementDate: creditCardStatement.statementDate,
  updatedAt: creditCardStatement.updatedAt,
};

export const creditMetrics = (
  account: { accountType: string; creditLimit: string | null },
  balance: string
): { availableCredit: string | null; utilization: string | null } => {
  if (account.accountType !== "credit_card" || account.creditLimit === null) {
    return { availableCredit: null, utilization: null };
  }

  const limit = signedScaledAmount(account.creditLimit);
  const outstanding = signedScaledAmount(balance);
  const availableCredit = fixedAmountText(limit - outstanding);
  if (limit <= 0) {
    return { availableCredit, utilization: null };
  }

  const utilizationHundredths =
    ((outstanding > 0 ? outstanding : 0n) * 10_000n + limit / 2n) / limit;
  return {
    availableCredit,
    utilization: `${utilizationHundredths / 100n}.${(
      utilizationHundredths % 100n
    )
      .toString()
      .padStart(2, "0")}`,
  };
};

/** An account row with its ledger balance and, for cards, credit figures. */
export const withBalance = async <
  T extends { accountType: string; creditLimit: string | null; id: string },
>(
  db: Database,
  organizationId: string,
  account: T
) => {
  const balance = await getAccountBalance(db, organizationId, account.id);
  return { ...account, balance, ...creditMetrics(account, balance) };
};

const requireCreditCard = async (
  db: Database,
  organizationId: string,
  accountId: string
): Promise<void> => {
  const account = await findOwned(
    db,
    financialAccount,
    { id: accountId, organizationId },
    "Financial account"
  );
  if (account.accountType !== "credit_card") {
    throw notFound("Financial account");
  }
};

export const hasFinancialHistory = async (
  db: Database,
  accountId: string
): Promise<boolean> => {
  const [posting] = await db
    .select({ id: financialTransaction.id })
    .from(financialTransaction)
    .where(eq(financialTransaction.accountId, accountId))
    .limit(1);
  if (posting) {
    return true;
  }
  const [statement] = await db
    .select({ id: creditCardStatement.id })
    .from(creditCardStatement)
    .where(eq(creditCardStatement.accountId, accountId))
    .limit(1);
  if (statement) {
    return true;
  }
  const [snapshot] = await db
    .select({ id: financialAccountBalanceSnapshot.id })
    .from(financialAccountBalanceSnapshot)
    .where(eq(financialAccountBalanceSnapshot.accountId, accountId))
    .limit(1);
  return snapshot !== undefined;
};

export const getAccount = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  const [account] = await db
    .select(accountFields)
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!account) {
    throw notFound("Financial account");
  }

  const owners = await db
    .select({ memberId: financialAccountOwner.memberId })
    .from(financialAccountOwner)
    .where(eq(financialAccountOwner.financialAccountId, account.id));

  return {
    ...(await withBalance(db, organizationId, account)),
    hasFinancialHistory: await hasFinancialHistory(db, accountId),
    interest: await accountInterestSummary(db, organizationId, accountId),
    ownerMemberIds: owners.map(({ memberId }) => memberId),
  };
};

export const assertReconciliationDate = (
  account: { archivedAt: Date | null; openingBalanceDate: string },
  effectiveDate: string
): void => {
  if (account.archivedAt !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Restore the account before reconciling it",
    });
  }
  if (effectiveDate < account.openingBalanceDate) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Reconciliation date cannot precede the opening balance date",
    });
  }
};

export const previewReconciliation = async (
  db: Database,
  organizationId: string,
  input: { accountId: string; effectiveDate: string }
) => {
  const account = await findOwned(
    db,
    financialAccount,
    { id: input.accountId, organizationId },
    "Financial account"
  );
  assertReconciliationDate(account, input.effectiveDate);
  return {
    calculatedBalance: await getAccountBalance(
      db,
      organizationId,
      account.id,
      input.effectiveDate
    ),
  };
};

export const listAccounts = async (
  db: Database,
  organizationId: string,
  includeArchived: boolean
) => {
  const conditions = [eq(financialAccount.organizationId, organizationId)];
  if (!includeArchived) {
    conditions.push(isNull(financialAccount.archivedAt));
  }

  const accounts = await db
    .select(accountFields)
    .from(financialAccount)
    .where(and(...conditions))
    .orderBy(asc(financialAccount.accountClass), asc(financialAccount.name));
  const owners = accounts.length
    ? await db
        .select({
          accountId: financialAccountOwner.financialAccountId,
          memberId: financialAccountOwner.memberId,
        })
        .from(financialAccountOwner)
        .where(
          inArray(
            financialAccountOwner.financialAccountId,
            accounts.map((account) => account.id)
          )
        )
    : [];
  const ownerMemberIds = new Map<string, string[]>();
  for (const owner of owners) {
    const memberIds = ownerMemberIds.get(owner.accountId) ?? [];
    memberIds.push(owner.memberId);
    ownerMemberIds.set(owner.accountId, memberIds);
  }

  const balances = await getAccountBalances(
    db,
    organizationId,
    accounts.map((account) => account.id)
  );

  return accounts.map((account) => {
    const balance = balances.get(account.id) ?? account.openingBalance;
    return {
      ...account,
      balance,
      ...creditMetrics(account, balance),
      ownerMemberIds: ownerMemberIds.get(account.id) ?? [],
    };
  });
};

export const listSnapshots = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  await findOwned(
    db,
    financialAccount,
    { id: accountId, organizationId },
    "Financial account"
  );

  return db
    .select({
      ...getTableColumns(financialAccountBalanceSnapshot),
      adjustmentArchivedAt: financialTransaction.archivedAt,
      transactionId: financialTransaction.id,
    })
    .from(financialAccountBalanceSnapshot)
    .leftJoin(
      financialTransaction,
      and(
        eq(
          financialTransaction.reconciliationSnapshotId,
          financialAccountBalanceSnapshot.id
        ),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(financialAccountBalanceSnapshot.accountId, accountId),
        eq(financialAccountBalanceSnapshot.organizationId, organizationId)
      )
    )
    .orderBy(
      desc(financialAccountBalanceSnapshot.effectiveDate),
      desc(financialAccountBalanceSnapshot.createdAt)
    );
};

export const listStatements = async (
  db: Database,
  organizationId: string,
  accountId: string
) => {
  await requireCreditCard(db, organizationId, accountId);

  return db
    .select(statementFields)
    .from(creditCardStatement)
    .where(
      and(
        eq(creditCardStatement.accountId, accountId),
        eq(creditCardStatement.organizationId, organizationId)
      )
    )
    .orderBy(
      desc(creditCardStatement.statementDate),
      desc(creditCardStatement.createdAt)
    );
};

/** Each card's latest statement, for due dates across every card in one call. */
export const latestStatements = (db: Database, organizationId: string) =>
  db
    .selectDistinctOn([creditCardStatement.accountId], statementFields)
    .from(creditCardStatement)
    .where(eq(creditCardStatement.organizationId, organizationId))
    .orderBy(
      asc(creditCardStatement.accountId),
      desc(creditCardStatement.statementDate),
      desc(creditCardStatement.createdAt)
    );
