import type { Database } from "@masdan/db";
import { featureFlag } from "@masdan/db/schema/feature-flags";
import type { FeatureFlagName, FeatureFlags } from "@masdan/env/flags";
import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_NAMES,
  FEATURE_FLAG_TTL_MS,
} from "@masdan/env/flags";
import { log, parseError } from "@masdan/observability";

/** Extra grace when the read fails, so a flapping database isn't re-queried per request. */
const ERROR_GRACE_MS = 5000;

let cached: { expiresAt: number; values: FeatureFlags } | null = null;

/**
 * Shared in-flight read, so expiry under load does not fan out one query per
 * concurrent request.
 */
let inflight: Promise<FeatureFlags> | null = null;

const readFlags = async (db: Database): Promise<FeatureFlags> => {
  const rows = await db
    .select({ enabled: featureFlag.enabled, name: featureFlag.name })
    .from(featureFlag);

  const overrides = new Map(rows.map((row) => [row.name, row.enabled]));

  // Built by walking the registry, never by returning whatever the table holds:
  // a flag deleted from code leaves an orphan row, and nothing should resurrect it.
  return Object.fromEntries(
    FEATURE_FLAG_NAMES.map((name) => [
      name,
      overrides.get(name) ?? FEATURE_FLAG_DEFAULTS[name],
    ])
  ) as FeatureFlags;
};

const loadFlags = async (db: Database): Promise<FeatureFlags> => {
  try {
    const values = await readFlags(db);
    cached = { expiresAt: Date.now() + FEATURE_FLAG_TTL_MS, values };
    return values;
  } catch (error) {
    // Stale-if-error: a flag lookup sits on the request path of everything it
    // gates, so it must not turn a degraded database into a 500.
    log.error({ action: "featureflags.read.failed", ...parseError(error) });
    const values = cached?.values ?? FEATURE_FLAG_DEFAULTS;
    cached = { expiresAt: Date.now() + ERROR_GRACE_MS, values };
    return values;
  }
};

/**
 * Every flag's effective value, cached per process for `FEATURE_FLAG_TTL_MS` —
 * immediate on the instance that toggled it, and within the TTL everywhere
 * else. Never call inside a mutation's transaction: `context.db` there is the
 * transaction, so a read-after-write would cache a value that can still roll
 * back.
 */
export const getFeatureFlags = async (db: Database): Promise<FeatureFlags> => {
  const current = cached;
  if (current && current.expiresAt > Date.now()) {
    return current.values;
  }

  inflight ??= loadFlags(db);
  const pending = inflight;

  try {
    return await pending;
  } finally {
    // Cleared by whichever caller resumes first; the rest see it already gone.
    if (inflight === pending) {
      inflight = null;
    }
  }
};

/** One flag, through the same cache. The value-arrives-as-a-value case. */
export const isFeatureEnabled = async (
  db: Database,
  name: FeatureFlagName
): Promise<boolean> => {
  const flags = await getFeatureFlags(db);
  return flags[name];
};

/**
 * Call from `context.afterCommit()`, never inline — inline it repopulates from
 * a transaction that can roll back.
 */
export const invalidateFeatureFlags = (): void => {
  cached = null;
};
