import {
  file,
  invitation,
  member,
  organization,
  user,
} from "@masdan/db/schema/index";
import { and, count, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../procedures";

/**
 * The `metadata` blob is how `packages/auth/src/index.ts` marks a personal
 * workspace. Parsed defensively: malformed or absent metadata is "not
 * personal", never a throw.
 */
const isPersonalOrg = (metadata: string | null): boolean => {
  if (!metadata) {
    return false;
  }
  try {
    return (JSON.parse(metadata) as { personal?: unknown }).personal === true;
  } catch {
    return false;
  }
};

/**
 * Cross-organization by design — listing every organization is the point of a
 * platform-admin surface. Read-only: better-auth's organization endpoints act
 * on the caller's own active organization, so a cross-org write would have to
 * bypass its hooks.
 */
export const organizationsPlatformRouter = {
  detail: adminProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [[org], members, invitations] = await Promise.all([
        context.db
          .select()
          .from(organization)
          .where(eq(organization.id, input.organizationId)),
        context.db
          .select({
            id: member.id,
            role: member.role,
            userEmail: user.email,
            userId: user.id,
            userName: user.name,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, input.organizationId)),
        context.db
          .select({
            email: invitation.email,
            expiresAt: invitation.expiresAt,
            id: invitation.id,
            inviterId: invitation.inviterId,
            role: invitation.role,
            status: invitation.status,
          })
          .from(invitation)
          .where(eq(invitation.organizationId, input.organizationId)),
      ]);

      return {
        invitations,
        members,
        organization: org
          ? { ...org, isPersonal: isPersonalOrg(org.metadata) }
          : null,
      };
    }),

  list: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        search: z.string().min(1).max(200).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const where = input.search
        ? ilike(organization.name, `%${input.search}%`)
        : undefined;

      const orgs = await context.db
        .select()
        .from(organization)
        .where(where)
        .limit(input.limit)
        .offset(input.offset);

      // Three small counts in parallel rather than one join, which would
      // multiply rows and need `count(distinct ...)` on each.
      const withCounts = await Promise.all(
        orgs.map(async (org) => {
          const [[memberCount], [pendingInvitationCount], [fileCount]] =
            await Promise.all([
              context.db
                .select({ count: count() })
                .from(member)
                .where(eq(member.organizationId, org.id)),
              context.db
                .select({ count: count() })
                .from(invitation)
                .where(
                  and(
                    eq(invitation.organizationId, org.id),
                    eq(invitation.status, "pending")
                  )
                ),
              context.db
                .select({ count: count() })
                .from(file)
                .where(eq(file.organizationId, org.id)),
            ]);

          return {
            ...org,
            fileCount: fileCount?.count ?? 0,
            isPersonal: isPersonalOrg(org.metadata),
            memberCount: memberCount?.count ?? 0,
            pendingInvitationCount: pendingInvitationCount?.count ?? 0,
          };
        })
      );

      return withCounts;
    }),
};
