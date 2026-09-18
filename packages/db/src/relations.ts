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
    organization: r.one.organization({
      from: r.category.organizationId,
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
    organization: r.one.organization({
      from: r.financialAccount.organizationId,
      optional: false,
      to: r.organization.id,
    }),
    owners: r.many.financialAccountOwner(),
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
    files: r.many.file(),
    financialAccounts: r.many.financialAccount(),
    invitations: r.many.invitation(),
    members: r.many.member(),
    tags: r.many.tag(),
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
  },
  user: {
    accounts: r.many.account(),
    files: r.many.file(),
    members: r.many.member(),
    sessions: r.many.session(),
  },
}));
