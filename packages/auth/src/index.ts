import { expo } from "@better-auth/expo";
import { createDb } from "@masdan/db";
import { DEFAULT_CATEGORIES } from "@masdan/db/reference/categories";
import * as schema from "@masdan/db/schema/index";
import { env } from "@masdan/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { and, asc, eq, isNull } from "drizzle-orm";

import { ac, roles } from "./permissions";
import { resolveRateLimitStorage } from "./rate-limit-storage";

/**
 * Scheme and hostname, no port, so `localhost:2600` -> `localhost:1900` is
 * already same-site. Conservative on purpose: calling two same-site subdomains
 * cross-site only loosens a cookie, while the opposite mistake breaks sign-in.
 * `null` is treated as cross-site.
 */
const siteOf = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return null;
  }
};

/**
 * `Secure` follows deployment, `SameSite` follows topology, deliberately
 * independent. Deriving both from one flag is the trap: `SameSite=None` is only
 * legal alongside `Secure`. `Secure` is off outside production because Safari
 * does not special-case `http://localhost` and none of the browsers extend the
 * exception to a LAN IP. That failure is silent — the cookie is dropped and
 * every request just looks signed out.
 */
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
        },
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      expo(),
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
      // No `storage` key: "secondary-storage" makes better-auth's
      // `getRateLimitStorage()` throw without `secondaryStorage`, which we do
      // not use. `customStorage` wins anyway.
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
    trustedOrigins: [
      env.CORS_ORIGIN,

      "masdan://",
      "exp://",
      "http://localhost:8081",
    ],
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
      } catch {
        // taken — try the next candidate
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
