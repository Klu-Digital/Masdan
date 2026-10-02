import { user } from "@masdan/db/schema/auth";
import { aiTokenCap } from "@masdan/db/schema/index";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { adminMutationProcedure, adminProcedure } from "../procedures";
import {
  AI_FEATURE_NAMES,
  AI_FEATURES,
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
} from "./features";
import { invalidateAiTokenCaps } from "./token-caps.cache";

/** Rejects anything not in the registry, so a typo can never become a dead row. */
const feature = z.enum(AI_FEATURE_NAMES);

// Platform surface: token caps are global, so this ignores `organizationId`.
export const aiPlatformRouter = {
  /** Drops the override so the feature falls back to its default cap. */
  resetTokenCap: adminMutationProcedure
    .input(z.object({ feature }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(aiTokenCap)
        .where(eq(aiTokenCap.feature, input.feature));
      context.log?.info("admin.ai.token_cap.reset", {
        action: "admin.ai.token_cap.reset",
        actorId: context.session.user.id,
        feature: input.feature,
      });
      context.afterCommit(() => Promise.resolve(invalidateAiTokenCaps()));
      return {
        feature: input.feature,
        maxTokens: AI_FEATURES[input.feature].defaultMaxTokens,
      };
    }),

  setTokenCap: adminMutationProcedure
    .input(
      z.object({
        feature,
        maxTokens: z.number().int().min(MIN_MAX_TOKENS).max(MAX_MAX_TOKENS),
      })
    )
    .handler(async ({ context, input }) => {
      await context.db
        .insert(aiTokenCap)
        .values({
          feature: input.feature,
          maxTokens: input.maxTokens,
          updatedBy: context.session.user.id,
        })
        .onConflictDoUpdate({
          set: {
            maxTokens: input.maxTokens,
            updatedBy: context.session.user.id,
          },
          target: aiTokenCap.feature,
        });
      context.log?.info("admin.ai.token_cap.set", {
        action: "admin.ai.token_cap.set",
        actorId: context.session.user.id,
        feature: input.feature,
        maxTokens: input.maxTokens,
      });
      context.afterCommit(() => Promise.resolve(invalidateAiTokenCaps()));
      return { feature: input.feature, maxTokens: input.maxTokens };
    }),

  /** Reads the table, not the cache: this screen needs the override/default split. */
  tokenCaps: adminProcedure.handler(async ({ context }) => {
    const rows = await context.db
      .select({
        feature: aiTokenCap.feature,
        maxTokens: aiTokenCap.maxTokens,
        updatedAt: aiTokenCap.updatedAt,
        updatedByEmail: user.email,
        updatedByName: user.name,
      })
      .from(aiTokenCap)
      .leftJoin(user, eq(user.id, aiTokenCap.updatedBy));
    const overrides = new Map(rows.map((row) => [row.feature, row]));

    return {
      caps: AI_FEATURE_NAMES.map((name) => {
        const override = overrides.get(name);
        const definition = AI_FEATURES[name];
        return {
          defaultMaxTokens: definition.defaultMaxTokens,
          feature: name,
          label: definition.label,
          maxTokens: override?.maxTokens ?? definition.defaultMaxTokens,
          overridden: override !== undefined,
          updatedAt: override?.updatedAt ?? null,
          updatedByEmail: override?.updatedByEmail ?? null,
          updatedByName: override?.updatedByName ?? null,
        };
      }),
      max: MAX_MAX_TOKENS,
      min: MIN_MAX_TOKENS,
    };
  }),
};
