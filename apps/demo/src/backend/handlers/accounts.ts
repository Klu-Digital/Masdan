import type { RouterInputs } from "@/utils/orpc";

import { today } from "../flows";
import { accountView, balanceOf } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Account, Statement } from "../store";
import { badRequest, byDateDesc, find, newId, scaled, text } from "../util";

type AccountValues = RouterInputs["accounts"]["create"];

const amountText = (value: string | null | undefined): string | null =>
  value === null || value === undefined ? null : text(scaled(value));

// oxlint-disable-next-line complexity
const accountValues = (values: AccountValues, existing?: Account) => ({
  accountClass: values.accountClass,
  accountType: values.accountType,
  cardLastFour: values.cardLastFour ?? null,
  cardNetwork: values.cardNetwork ?? null,
  cardProductKey: values.cardProductKey ?? null,
  color: values.color ?? null,
  creditLimit: amountText(values.creditLimit),
  currencyCode:
    values.currencyCode ??
    existing?.currencyCode ??
    db().household.defaultCurrency,
  icon: values.icon ?? null,
  includeInNetWorth: values.includeInNetWorth ?? true,
  institution: values.institution ?? null,
  institutionId: values.institutionId ?? null,
  liquidity: values.liquidity ?? null,
  name: values.name,
  notes: values.notes ?? null,
  openingBalance:
    amountText(values.openingBalance) ?? existing?.openingBalance ?? text(0n),
  openingBalanceDate:
    values.openingBalanceDate ?? existing?.openingBalanceDate ?? today(),
  ownerMemberIds: values.ownerMemberIds ?? existing?.ownerMemberIds ?? [],
  paymentDueDay: values.paymentDueDay ?? null,
  statementClosingDay: values.statementClosingDay ?? null,
});

const setArchived = (accountId: string, archived: boolean) => {
  const account = find(db().accounts, accountId, "Financial account");
  account.archivedAt = archived ? new Date() : null;
  account.updatedAt = new Date();
  return accountView(account);
};

const cardStatements = (accountId: string): Statement[] => {
  const account = find(db().accounts, accountId, "Financial account");
  if (account.accountType !== "credit_card") {
    throw badRequest("Only credit cards have statements");
  }
  return db()
    .statements.filter((row) => row.accountId === accountId)
    .toSorted((a, b) => byDateDesc(a.statementDate, b.statementDate));
};

const reconcilable = (accountId: string, effectiveDate: string): Account => {
  const account = find(db().accounts, accountId, "Financial account");
  if (account.archivedAt !== null) {
    throw badRequest("Restore the account before reconciling it");
  }
  if (effectiveDate < account.openingBalanceDate) {
    throw badRequest(
      "Reconciliation date cannot precede the opening balance date"
    );
  }
  return account;
};

export const accounts: Section<"accounts"> = {
  archive: ({ accountId }) => setArchived(accountId, true),

  create: (input) => {
    const now = new Date();
    const account: Account = {
      ...accountValues(input),
      archivedAt: null,
      createdAt: now,
      id: newId(),
      organizationId: db().household.id,
      updatedAt: now,
    };
    db().accounts.push(account);
    return accountView(account);
  },

  createStatement: (input) => {
    cardStatements(input.accountId);
    const now = new Date();
    const statement: Statement = {
      accountId: input.accountId,
      createdAt: now,
      dueDate: input.dueDate ?? null,
      id: newId(),
      minimumAmountDue: amountText(input.minimumAmountDue),
      organizationId: db().household.id,
      periodEnd: input.periodEnd,
      periodStart: input.periodStart,
      statementBalance: text(scaled(input.statementBalance)),
      statementDate: input.statementDate,
      updatedAt: now,
    };
    db().statements.push(statement);
    return statement;
  },

  get: ({ accountId }) => {
    const account = find(db().accounts, accountId, "Financial account");
    return {
      ...accountView(account),
      hasFinancialHistory:
        db().transactions.some((row) => row.accountId === accountId) ||
        db().statements.some((row) => row.accountId === accountId) ||
        db().snapshots.some((row) => row.accountId === accountId),
      interest: null,
    };
  },

  list: (input) =>
    db()
      .accounts.filter(
        (row) => input?.includeArchived === true || row.archivedAt === null
      )
      .toSorted(
        (a, b) =>
          a.accountClass.localeCompare(b.accountClass) ||
          a.name.localeCompare(b.name)
      )
      .map(accountView),

  listSnapshots: ({ accountId }) => {
    find(db().accounts, accountId, "Financial account");
    return db()
      .snapshots.filter((row) => row.accountId === accountId)
      .toSorted(
        (a, b) =>
          byDateDesc(a.effectiveDate, b.effectiveDate) ||
          b.createdAt.getTime() - a.createdAt.getTime()
      )
      .map((snapshot) => {
        const adjustment = db().transactions.find(
          (row) => row.reconciliationSnapshotId === snapshot.id
        );
        return {
          ...snapshot,
          adjustmentArchivedAt: adjustment?.archivedAt ?? null,
          transactionId: adjustment?.id ?? null,
        };
      });
  },

  listStatements: ({ accountId }) => cardStatements(accountId),

  previewReconciliation: ({ accountId, effectiveDate }) => ({
    calculatedBalance: text(
      balanceOf(reconcilable(accountId, effectiveDate), effectiveDate)
    ),
  }),

  reconcile: (input) => {
    const account = reconcilable(input.accountId, input.effectiveDate);
    const calculated = balanceOf(account, input.effectiveDate);
    if (calculated !== scaled(input.expectedBalance)) {
      throw badRequest(
        "The account balance changed. Review the refreshed adjustment and confirm again."
      );
    }
    const delta = scaled(input.balance) - calculated;
    const now = new Date();
    const snapshot = {
      accountId: account.id,
      adjustment: text(delta),
      balance: text(scaled(input.balance)),
      createdAt: now,
      effectiveDate: input.effectiveDate,
      id: newId(),
      importReference: null,
      notes: input.notes ?? null,
      organizationId: db().household.id,
      source: "reconciliation" as const,
    };
    db().snapshots.push(snapshot);
    if (delta !== 0n) {
      db().transactions.push({
        accountId: account.id,
        adjustmentDirection: delta > 0n ? "increase" : "decrease",
        amount: text(delta > 0n ? delta : -delta),
        archivedAt: null,
        categoryId: null,
        createdAt: now,
        createdByUserId: db().user.id,
        currencyCode: account.currencyCode,
        id: newId(),
        notes: input.notes ?? null,
        organizationId: db().household.id,
        paidStatus: "paid",
        reconciliationSnapshotId: snapshot.id,
        recurringOccurrenceDate: null,
        recurringScheduleId: null,
        ruleApplication: null,
        splits: [],
        suggestionApplication: null,
        tagIds: [],
        transactionDate: input.effectiveDate,
        transferId: null,
        transferSide: null,
        updatedAt: now,
      });
    }
    return {
      adjustment: text(delta),
      calculatedBalance: text(calculated),
      snapshot,
    };
  },

  restore: ({ accountId }) => setArchived(accountId, false),

  statementsSummary: () => {
    const latest = new Map<string, Statement>();
    for (const statement of db().statements) {
      const current = latest.get(statement.accountId);
      if (!current || statement.statementDate > current.statementDate) {
        latest.set(statement.accountId, statement);
      }
    }
    return [...latest.values()];
  },

  update: ({ accountId, ...values }) => {
    const account = find(db().accounts, accountId, "Financial account");
    Object.assign(account, accountValues(values, account), {
      updatedAt: new Date(),
    });
    return accountView(account);
  },
};
