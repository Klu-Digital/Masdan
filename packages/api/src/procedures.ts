import type { PermissionRequest } from "@masdan/auth/permissions";
import { hasPermission, isPlatformAdmin } from "@masdan/auth/permissions";
import { member } from "@masdan/db/schema/auth";
import type { FeatureFlagName } from "@masdan/env/flags";
import { orpcLogger } from "@masdan/observability/orpc";
import { ORPCError, os } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Context } from "./context";
import { isFeatureEnabled } from "./feature-flags/feature-flags.cache";
import { domainErrors } from "./shared/errors";

export const o = os.$context<Context>().errors(domainErrors);

export const publicProcedure = o.use(orpcLogger());

const requireAuth = o.middleware(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

/**
 * Resolves the caller's role once here, so downstream permission checks are
 * in-memory comparisons.
 */
const requireOrganization = o.middleware(async ({ context, next }) => {
  const organizationId = context.session?.session.activeOrganizationId;
  const userId = context.session?.user.id;
  if (!organizationId || !userId) {
    throw new ORPCError("FORBIDDEN", { message: "No active household" });
  }

  const [membership] = await context.db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1);

  if (!membership) {
    throw new ORPCError("FORBIDDEN", {
      message: "Not a member of the active household",
    });
  }

  return next({
    context: {
      memberRole: membership.role,
      organizationId,
    },
  });
});

export const orgProcedure = protectedProcedure.use(requireOrganization);

// `async` on purpose: drizzle's `.transaction()` wants a real `Promise`, and
// the `await` is what holds the SQL transaction open until the rest of the
// chain has settled.
const transaction = o.middleware(({ context, next }) =>
  context.db.transaction(
    async (db) =>
      await next({
        context: {
          db,
        },
      })
  )
);

/**
 * Lets a mutation queue work — cache invalidation, typically — to run after its
 * transaction commits. Called inline, a `cache.del()` purges a key the
 * transaction may still roll back. The `.use()` order below is load-bearing:
 * middleware wraps outside-in, so `.use(transaction).use(afterCommit)` nests
 * the transaction inside this `await` and silently reintroduces the bug. Task
 * errors are logged, never rethrown.
 */
const afterCommit = o.middleware(async ({ context, next }) => {
  const tasks: (() => Promise<unknown>)[] = [];

  // `next` is oRPC's continuation, not a Node-style callback.
  // oxlint-disable-next-line node/callback-return
  const result = await next({
    context: {
      afterCommit: (fn: () => Promise<unknown>) => {
        tasks.push(fn);
      },
    },
  });

  for (const task of tasks) {
    await task().catch((error: unknown) => {
      context.log?.error(
        error instanceof Error ? error : new Error(String(error)),
        {
          action: "aftercommit.failed",
        }
      );
    });
  }

  return result;
});

export const mutationProcedure = protectedProcedure
  .use(afterCommit)
  .use(transaction);

export const orgMutationProcedure = orgProcedure
  .use(afterCommit)
  .use(transaction);

/**
 * Gates on the global back-office role from better-auth's `admin()` plugin
 * (`user.role`), not the per-organization `member.role` that
 * `requirePermission` reads. Admin read paths built on this deliberately ignore
 * `organizationId`.
 */
const requirePlatformAdmin = o.middleware(({ context, next }) => {
  if (!isPlatformAdmin(context.session?.user.role)) {
    // FORBIDDEN, not NOT_FOUND: the caller is authenticated, and hiding the
    // route's existence buys nothing once the OpenAPI reference lists it.
    throw new ORPCError("FORBIDDEN", { message: "Platform admin only" });
  }
  return next();
});

export const adminProcedure = protectedProcedure.use(requirePlatformAdmin);

export const adminMutationProcedure = adminProcedure
  .use(afterCommit)
  .use(transaction);

/**
 * Read through the per-process flag cache, so this is a map lookup rather than
 * a query per call. Use it when a flag should make something unreachable — the
 * web app's `useFeatureFlag` is cosmetic, and the procedure stays callable by
 * anyone who knows its name.
 */
export const requireFlag = (name: FeatureFlagName) =>
  o.middleware(async ({ context, next }) => {
    if (!(await isFeatureEnabled(context.db, name))) {
      // NOT_FOUND, not FORBIDDEN: FORBIDDEN confirms the endpoint exists.
      throw new ORPCError("NOT_FOUND");
    }
    return next();
  });

export { rateLimit } from "./rate-limit";
export type { RateLimitOptions } from "./rate-limit";

/** Context guaranteed by `orgProcedure`, and required by everything below. */
type OrgContext = Context & { organizationId: string; memberRole: string };

const orgContext = os.$context<OrgContext>();

/**
 * Permissions are ANDed, and stacking two `.use()` calls is still an all-of.
 * Model an either-or as one role that has both.
 */
export const requirePermission = (permissions: PermissionRequest) =>
  orgContext.middleware(({ context, next }) => {
    if (!hasPermission({ permissions, role: context.memberRole })) {
      throw new ORPCError("FORBIDDEN", {
        message: `Missing permission: ${JSON.stringify(permissions)}`,
      });
    }
    return next();
  });

/**
 * The same check as an expression, for authorization that depends on the row
 * rather than the route.
 */
export const assertPermission = (
  context: { memberRole: string },
  permissions: PermissionRequest
): void => {
  if (!hasPermission({ permissions, role: context.memberRole })) {
    throw new ORPCError("FORBIDDEN", {
      message: `Missing permission: ${JSON.stringify(permissions)}`,
    });
  }
};
