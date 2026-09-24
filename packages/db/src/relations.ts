import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      optional: false,
      to: r.user.id,
    }),
  },
  category: {
    budgets: r.many.categoryBudget(),
    organization: r.one.organization({
      from: r.category.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    splitTransactions: r.many.financialTransactionSplit(),
    transactions: r.many.financialTransaction(),
  },
  categoryBudget: {
    category: r.one.category({
      from: r.categoryBudget.categoryId,
      optional: false,
      to: r.category.id,
    }),
    organization: r.one.organization({
      from: r.categoryBudget.organizationId,
      optional: false,
      to: r.organization.id,
    }),
  },
  creditCardReminder: {
    account: r.one.financialAccount({
      from: r.creditCardReminder.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    organization: r.one.organization({
      from: r.creditCardReminder.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    statement: r.one.creditCardStatement({
      from: r.creditCardReminder.statementId,
      to: r.creditCardStatement.id,
    }),
  },
  creditCardStatement: {
    account: r.one.financialAccount({
      from: r.creditCardStatement.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    organization: r.one.organization({
      from: r.creditCardStatement.organizationId,
      optional: false,
      to: r.organization.id,
    }),
  },
  file: {
    organization: r.one.organization({
      from: r.file.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    user: r.one.user({ from: r.file.userId, optional: false, to: r.user.id }),
  },
  financialAccount: {
    balanceSnapshots: r.many.financialAccountBalanceSnapshot(),
    creditCardReminders: r.many.creditCardReminder(),
    creditCardStatements: r.many.creditCardStatement(),
    organization: r.one.organization({
      from: r.financialAccount.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    owners: r.many.financialAccountOwner(),
    savingsGoals: r.many.savingsGoal(),
    transactions: r.many.financialTransaction(),
  },
  financialAccountBalanceSnapshot: {
    account: r.one.financialAccount({
      from: r.financialAccountBalanceSnapshot.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
  },
  financialAccountOwner: {
    account: r.one.financialAccount({
      from: r.financialAccountOwner.financialAccountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    member: r.one.member({
      from: r.financialAccountOwner.memberId,
      optional: false,
      to: r.member.id,
    }),
  },
  financialTransaction: {
    account: r.one.financialAccount({
      from: r.financialTransaction.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    attachments: r.many.financialTransactionAttachment(),
    category: r.one.category({
      from: r.financialTransaction.categoryId,
      optional: true,
      to: r.category.id,
    }),
    organization: r.one.organization({
      from: r.financialTransaction.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    recurringSchedule: r.one.recurringSchedule({
      from: r.financialTransaction.recurringScheduleId,
      optional: true,
      to: r.recurringSchedule.id,
    }),
    splits: r.many.financialTransactionSplit(),
    tags: r.many.financialTransactionTag(),
    transfer: r.one.financialTransfer({
      from: r.financialTransaction.transferId,
      optional: true,
      to: r.financialTransfer.id,
    }),
  },
  financialTransactionAttachment: {
    file: r.one.file({
      from: r.financialTransactionAttachment.fileId,
      optional: false,
      to: r.file.id,
    }),
    transaction: r.one.financialTransaction({
      from: r.financialTransactionAttachment.transactionId,
      optional: false,
      to: r.financialTransaction.id,
    }),
  },
  financialTransactionSplit: {
    category: r.one.category({
      from: r.financialTransactionSplit.categoryId,
      optional: false,
      to: r.category.id,
    }),
    transaction: r.one.financialTransaction({
      from: r.financialTransactionSplit.transactionId,
      optional: false,
      to: r.financialTransaction.id,
    }),
  },
  financialTransactionTag: {
    tag: r.one.tag({
      from: r.financialTransactionTag.tagId,
      optional: false,
      to: r.tag.id,
    }),
    transaction: r.one.financialTransaction({
      from: r.financialTransactionTag.transactionId,
      optional: false,
      to: r.financialTransaction.id,
    }),
  },
  financialTransfer: {
    destinationAccount: r.one.financialAccount({
      from: r.financialTransfer.destinationAccountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    organization: r.one.organization({
      from: r.financialTransfer.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    postings: r.many.financialTransaction(),
    sourceAccount: r.one.financialAccount({
      from: r.financialTransfer.sourceAccountId,
      optional: false,
      to: r.financialAccount.id,
    }),
  },
  invitation: {
    inviter: r.one.user({
      from: r.invitation.inviterId,
      optional: false,
      to: r.user.id,
    }),
    organization: r.one.organization({
      from: r.invitation.organizationId,
      optional: false,
      to: r.organization.id,
    }),
  },
  member: {
    financialAccountOwners: r.many.financialAccountOwner(),
    organization: r.one.organization({
      from: r.member.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    user: r.one.user({ from: r.member.userId, optional: false, to: r.user.id }),
  },
  organization: {
    categories: r.many.category(),
    categoryBudgets: r.many.categoryBudget(),
    creditCardReminders: r.many.creditCardReminder(),
    creditCardStatements: r.many.creditCardStatement(),
    files: r.many.file(),
    financialAccounts: r.many.financialAccount(),
    invitations: r.many.invitation(),
    members: r.many.member(),
    recurringSchedules: r.many.recurringSchedule(),
    savingsGoals: r.many.savingsGoal(),
    tags: r.many.tag(),
    transactionRules: r.many.transactionRule(),
    transactions: r.many.financialTransaction(),
    transfers: r.many.financialTransfer(),
  },
  recurringSchedule: {
    account: r.one.financialAccount({
      from: r.recurringSchedule.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    category: r.one.category({
      from: r.recurringSchedule.categoryId,
      optional: false,
      to: r.category.id,
    }),
    organization: r.one.organization({
      from: r.recurringSchedule.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    tags: r.many.recurringScheduleTag(),
    transactions: r.many.financialTransaction(),
  },
  recurringScheduleTag: {
    schedule: r.one.recurringSchedule({
      from: r.recurringScheduleTag.scheduleId,
      optional: false,
      to: r.recurringSchedule.id,
    }),
    tag: r.one.tag({
      from: r.recurringScheduleTag.tagId,
      optional: false,
      to: r.tag.id,
    }),
  },
  savingsGoal: {
    account: r.one.financialAccount({
      from: r.savingsGoal.accountId,
      optional: false,
      to: r.financialAccount.id,
    }),
    organization: r.one.organization({
      from: r.savingsGoal.organizationId,
      optional: false,
      to: r.organization.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      optional: false,
      to: r.user.id,
    }),
  },
  tag: {
    organization: r.one.organization({
      from: r.tag.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    transactionTags: r.many.financialTransactionTag(),
  },
  transactionRule: {
    category: r.one.category({
      from: r.transactionRule.setCategoryId,
      optional: true,
      to: r.category.id,
    }),
    organization: r.one.organization({
      from: r.transactionRule.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    tags: r.many.transactionRuleTag(),
  },
  transactionRuleTag: {
    rule: r.one.transactionRule({
      from: r.transactionRuleTag.ruleId,
      optional: false,
      to: r.transactionRule.id,
    }),
    tag: r.one.tag({
      from: r.transactionRuleTag.tagId,
      optional: false,
      to: r.tag.id,
    }),
  },
  user: {
    accounts: r.many.account(),
    files: r.many.file(),
    members: r.many.member(),
    sessions: r.many.session(),
  },
}));
