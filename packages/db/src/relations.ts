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
    invitations: r.many.invitation(),
    members: r.many.member(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      optional: false,
      to: r.user.id,
    }),
  },
  user: {
    accounts: r.many.account(),
    files: r.many.file(),
    members: r.many.member(),
    sessions: r.many.session(),
  },
}));
