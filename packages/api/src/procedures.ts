import type { PermissionRequest } from "@masdan/auth/permissions";
import { hasPermission, isPlatformAdmin } from "@masdan/auth/permissions";
import { member } from "@masdan/db/schema/auth";
import type { FeatureFlagName } from "@masdan/env/flags";
import { orpcLogger } from "@masdan/observability/orpc";
import { ORPCError, os } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";
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

// `async` on purpose: the `await` holds the SQL transaction open.
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

// Defers cache invalidation until commit. Keep `.use(afterCommit)` before
// `.use(transaction)`, or the task runs inside the transaction again.
const afterCommit = o.middleware(async ({ context, next }) => {
  // Nested mutations must wait for the outer commit, not a savepoint release.
  if (context.afterCommit) {
    return next({ context: { afterCommit: context.afterCommit } });
  }
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

// `user.role`, not `member.role`. Ignores `organizationId` by design.
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

// Makes a procedure unreachable; `useFeatureFlag` in the web app is cosmetic.
export const requireFlag = (name: FeatureFlagName) =>
  o.middleware(async ({ context, next }) => {
    if (!(await isFeatureEnabled(context.db, name))) {
      // NOT_FOUND, not FORBIDDEN: FORBIDDEN confirms the endpoint exists.
      throw new ORPCError("NOT_FOUND");
    }
    return next();
  });

export { rateLimit } from "./rate-limit";

/** Context guaranteed by `orgProcedure`, and required by everything below. */
type OrgContext = Context & { organizationId: string; memberRole: string };

const orgContext = os.$context<OrgContext>();

const permissionChecks = new WeakMap<object, PermissionRequest>();

// Permissions are ANDed, stacked `.use()` calls included.
export const requirePermission = (permissions: PermissionRequest) => {
  const middleware = orgContext.middleware(({ context, next }) => {
    if (!hasPermission({ permissions, role: context.memberRole })) {
      throw new ORPCError("FORBIDDEN", {
        message: `Missing permission: ${JSON.stringify(permissions)}`,
      });
    }
    return next();
  });
  permissionChecks.set(middleware, permissions);
  return middleware;
};

/** Tool discovery shares the route's checks; execution still runs middleware. */
export const procedureAccess = (procedure: AnyProcedure) => {
  const { middlewares } = procedure["~orpc"];
  return {
    household: middlewares.includes(requireOrganization),
    permissions: middlewares.flatMap((middleware) => {
      const permissions = permissionChecks.get(middleware);
      return permissions ? [permissions] : [];
    }),
    write: middlewares.includes(transaction),
  };
};

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
