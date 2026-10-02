import { user } from "@masdan/db/schema/auth";
import { featureFlag } from "@masdan/db/schema/feature-flags";
import { FEATURE_FLAG_NAMES, featureFlagRegistry } from "@masdan/env/flags";
import type { FeatureFlagName } from "@masdan/env/flags";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { adminMutationProcedure, adminProcedure } from "../procedures";
import { invalidateFeatureFlags } from "./feature-flags.cache";

/** Rejects anything not in the registry, so a typo can never become a dead row. */
const flagName = z.enum(FEATURE_FLAG_NAMES);

export const featureFlagsPlatformRouter = {
  list: adminProcedure.handler(async ({ context }) => {
    const rows = await context.db
      .select({
        enabled: featureFlag.enabled,
        name: featureFlag.name,
        updatedAt: featureFlag.updatedAt,
        updatedByEmail: user.email,
        updatedByName: user.name,
      })
      .from(featureFlag)
      .leftJoin(user, eq(user.id, featureFlag.updatedBy));

    const overrides = new Map(rows.map((row) => [row.name, row]));

    return FEATURE_FLAG_NAMES.map((name) => {
      const override = overrides.get(name);
      const definition = featureFlagRegistry[name];

      return {
        defaultEnabled: definition.defaultEnabled,
        description: definition.description,
        enabled: override?.enabled ?? definition.defaultEnabled,
        name,
        overridden: override !== undefined,
        updatedAt: override?.updatedAt ?? null,
        updatedByEmail: override?.updatedByEmail ?? null,
        updatedByName: override?.updatedByName ?? null,
      };
    });
  }),

  /** Drops the override so the flag falls back to its declared default. */
  reset: adminMutationProcedure
    .input(z.object({ name: flagName }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(featureFlag)
        .where(eq(featureFlag.name, input.name));

      context.log?.info("admin.flags.reset", {
        action: "admin.flags.reset",
        actorId: context.session.user.id,
        flag: input.name,
      });

      context.afterCommit(() => Promise.resolve(invalidateFeatureFlags()));

      const name: FeatureFlagName = input.name;
      return { enabled: featureFlagRegistry[name].defaultEnabled, name };
    }),

  set: adminMutationProcedure
    .input(z.object({ enabled: z.boolean(), name: flagName }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .insert(featureFlag)
        .values({
          enabled: input.enabled,
          name: input.name,
          updatedBy: context.session.user.id,
        })
        .onConflictDoUpdate({
          set: {
            enabled: input.enabled,
            updatedBy: context.session.user.id,
          },
          target: featureFlag.name,
        })
        .returning();

      context.log?.info("admin.flags.set", {
        action: "admin.flags.set",
        actorId: context.session.user.id,
        enabled: input.enabled,
        flag: input.name,
      });

      context.afterCommit(() => Promise.resolve(invalidateFeatureFlags()));

      return { enabled: row?.enabled ?? input.enabled, name: input.name };
    }),
};
