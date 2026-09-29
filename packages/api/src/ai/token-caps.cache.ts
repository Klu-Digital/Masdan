import type { Database } from "@masdan/db";
import { aiTokenCap } from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";

import { AI_FEATURE_NAMES, DEFAULT_AI_TOKEN_CAPS } from "./features";
import type { AiTokenCaps } from "./features";

/** Same reach as feature flags: immediate here, within 30s on other instances. */
const TTL_MS = 30_000;
/** Extra grace when the read fails, so a flapping database isn't re-queried per call. */
const ERROR_GRACE_MS = 5000;

let cached: { expiresAt: number; values: AiTokenCaps } | null = null;
let inflight: Promise<AiTokenCaps> | null = null;

const loadCaps = async (db: Database): Promise<AiTokenCaps> => {
  try {
    const rows = await db
      .select({ feature: aiTokenCap.feature, maxTokens: aiTokenCap.maxTokens })
      .from(aiTokenCap);
    const overrides = new Map(rows.map((row) => [row.feature, row.maxTokens]));
    // Walks the registry, so an orphan row for a removed feature is ignored.
    const values = Object.fromEntries(
      AI_FEATURE_NAMES.map((name) => [
        name,
        overrides.get(name) ?? DEFAULT_AI_TOKEN_CAPS[name],
      ])
    ) as AiTokenCaps;
    cached = { expiresAt: Date.now() + TTL_MS, values };
    return values;
  } catch (error) {
    // Stale-if-error: the defaults are safe caps, so a failed read never blocks AI.
    log.error({ action: "ai.token_caps.read_failed", ...parseError(error) });
    const values = cached?.values ?? DEFAULT_AI_TOKEN_CAPS;
    cached = { expiresAt: Date.now() + ERROR_GRACE_MS, values };
    return values;
  }
};

/** Never call inside a mutation's transaction: it would cache writes that can roll back. */
export const getAiTokenCaps = async (db: Database): Promise<AiTokenCaps> => {
  const current = cached;
  if (current && current.expiresAt > Date.now()) {
    return current.values;
  }
  inflight ??= loadCaps(db);
  const pending = inflight;
  try {
    return await pending;
  } finally {
    if (inflight === pending) {
      inflight = null;
    }
  }
};

/** Call from `context.afterCommit()`, never inline. */
export const invalidateAiTokenCaps = (): void => {
  cached = null;
};
