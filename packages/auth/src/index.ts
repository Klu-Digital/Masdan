import { createDb } from "@masdan/db";
import { DEFAULT_CATEGORIES } from "@masdan/db/reference/categories";
import * as schema from "@masdan/db/schema/index";
import { env } from "@masdan/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { and, asc, eq, isNull } from "drizzle-orm";

import { deliver } from "./deliver";
import { ac, roles } from "./permissions";
import { resolveRateLimitStorage } from "./rate-limit-storage";
import { resetPasswordUrl } from "./reset-link";
import {
  anyUserExists,
  isPendingInvitation,
  signUpAllowed,
} from "./sign-up-gate";

// Port-agnostic. Unsure means cross-site: that only loosens a cookie.
const siteOf = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
};

// `Secure` follows deployment, `SameSite` topology: `SameSite=None` needs
// `Secure`, and Safari drops `Secure` cookies on http://localhost silently.
export const defaultCookieAttributes = (
  nodeEnv: string,
  origins: { apiUrl: string; webOrigin: string }
) => {
  const deployed = nodeEnv === "production" || nodeEnv === "staging";
  const apiSite = siteOf(origins.apiUrl);
  const crossSite = apiSite === null || apiSite !== siteOf(origins.webOrigin);

  return {
    httpOnly: true,
    sameSite: deployed && crossSite ? ("none" as const) : ("lax" as const),
    secure: deployed,
  };
};

// No `cookieCache`: a cached session outlives an admin-issued reset's revocation.
const SESSION = {
  cookieCache: { enabled: false },
  expiresIn: 60 * 60 * 24 * 7,
  freshAge: 60 * 60 * 24,
  updateAge: 60 * 60 * 24,
};

// These match invitees by email; link invitations in @masdan/api replace them.
const EMAIL_MATCHED_INVITATION_PATHS = new Set([
  "/organization/accept-invitation",
  "/organization/get-invitation",
  "/organization/list-user-invitations",
  "/organization/reject-invitation",
]);

const SIGN_UP_PATH = "/sign-up/email";

/** Turn a user's name into a slug candidate: `Ada Lovelace` -> `ada-lovelace`. */
export const slugifyName = (name: string): string => {
  const base = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return base || "household";
};

export const createAuth = () => {
  const db = createDb();

  const auth = betterAuth({
    advanced: {
      database: {
        generateId: "uuid",
      },
      defaultCookieAttributes: defaultCookieAttributes(env.NODE_ENV, {
        apiUrl: env.BETTER_AUTH_URL,
        webOrigin: env.CORS_ORIGIN,
      }),
    },
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",

      schema,
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            // Declared below because it closes over `auth`, still being built here.
            // oxlint-disable-next-line no-use-before-define
            const activeOrganizationId = await personalOrganizationId(
              session.userId
            );
            if (!activeOrganizationId) {
              return;
            }
            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            const personalOrg = await auth.api.createOrganization({
              body: {
                keepCurrentActiveOrganization: true,
                // How `personalOrganizationId` finds it again at session creation.
                metadata: { personal: true },
                name: `${user.name}'s Household`,
                // oxlint-disable-next-line no-use-before-define
                slug: await personalOrgSlug(user),
                userId: user.id,
              },
            });

            if (personalOrg) {
              await db
                .update(schema.session)
                .set({ activeOrganizationId: personalOrg.id })
                .where(
                  and(
                    eq(schema.session.userId, user.id),
                    isNull(schema.session.activeOrganizationId)
                  )
                );
            }
          },
          before: async (user, context) => {
            // Only HTTP sign-up bootstraps; the seeder and tests must not mint an admin.
            const bootstrap =
              context?.path === SIGN_UP_PATH &&
              context.request !== undefined &&
              !(await anyUserExists(db));
            if (!bootstrap) {
              return;
            }
            return { data: { ...user, role: "admin" } };
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, token }) =>
        deliver({
          body: resetPasswordUrl(env.CORS_ORIGIN, token),
          subject: "Password reset link",
          to: user.email,
        }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (EMAIL_MATCHED_INVITATION_PATHS.has(ctx.path)) {
          throw new APIError("NOT_FOUND");
        }
        // Server-side `auth.api` calls (seeder, tests) carry no request.
        if (ctx.path !== SIGN_UP_PATH || ctx.request === undefined) {
          return;
        }
        const allowed = signUpAllowed({
          allowSignup: env.ALLOW_SIGNUP,
          hasUsers: await anyUserExists(db),
          invitationPending: await isPendingInvitation(
            db,
            (ctx.body as { invitationId?: unknown } | undefined)?.invitationId
          ),
        });
        if (!allowed) {
          throw new APIError("FORBIDDEN", {
            code: "SIGN_UP_INVITE_ONLY",
            message:
              "Sign-up is by invitation. Ask a household admin for an invite link.",
          });
        }
      }),
    },
    plugins: [
      admin(),
      organization({
        ac,
        organizationHooks: {
          afterCreateOrganization: async ({
            organization: createdOrganization,
          }) => {
            await db.insert(schema.category).values(
              DEFAULT_CATEGORIES.map((defaultCategory) => ({
                ...defaultCategory,
                organizationId: createdOrganization.id,
              }))
            );
          },
        },
        roles,
      }),
    ],
    rateLimit: {
      // No `storage` key: "secondary-storage" throws without `secondaryStorage`.
      customStorage: resolveRateLimitStorage(),
      // better-auth resolves `enabled ?? isProduction`. Spread rather than pass
      // `undefined` so a future version checking key presence still sees none.
      ...(env.AUTH_RATE_LIMIT_ENABLED === undefined
        ? {}
        : { enabled: env.AUTH_RATE_LIMIT_ENABLED }),
      max: env.AUTH_RATE_LIMIT_MAX,
      window: env.AUTH_RATE_LIMIT_WINDOW,
    },
    secret: env.BETTER_AUTH_SECRET,
    session: SESSION,
    trustedOrigins: [env.CORS_ORIGIN],
  });

  const personalOrgSlug = async (user: {
    id: string;
    name: string;
  }): Promise<string> => {
    const base = slugifyName(user.name);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        await auth.api.checkOrganizationSlug({ body: { slug: candidate } });
        return candidate;
      } catch (error) {
        // Only better-auth's own "slug taken" answer means try the next one.
        if (
          !(error instanceof APIError) ||
          error.body?.code !== "ORGANIZATION_SLUG_ALREADY_TAKEN"
        ) {
          throw error;
        }
      }
    }

    return `${base}-${user.id.replaceAll("-", "").slice(-12)}`;
  };

  const personalOrganizationId = async (
    userId: string
  ): Promise<string | undefined> => {
    const memberships = await db
      .select({
        metadata: schema.organization.metadata,
        organizationId: schema.member.organizationId,
      })
      .from(schema.member)
      .innerJoin(
        schema.organization,
        eq(schema.organization.id, schema.member.organizationId)
      )
      .where(eq(schema.member.userId, userId))
      .orderBy(asc(schema.member.createdAt));

    const [oldest] = memberships;
    if (!oldest) {
      return undefined;
    }

    const personal = memberships.find((m) => {
      if (!m.metadata) {
        return false;
      }
      try {
        return (
          (JSON.parse(m.metadata) as { personal?: unknown }).personal === true
        );
      } catch {
        return false;
      }
    });

    return (personal ?? oldest).organizationId;
  };

  return auth;
};

export const auth = createAuth();
