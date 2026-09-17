/**
 * The feature flag registry. Declaring a flag here is what creates it; its
 * value lives in the `feature_flag` table and is toggled at /admin/flags, so
 * turning one on is a click, not a deploy. Keep it free of `dotenv` /
 * `process.env` and of any dependency on `@k22i/db`: the web bundle imports
 * `FeatureFlagName` from here. Deliberately global — no per-user targeting and
 * no percentage rollout.
 */
export interface FeatureFlagDefinition {
  /** Value used until an admin overrides it. A new flag needs no DB row to exist. */
  defaultEnabled: boolean;
  /** Shown in the admin UI. Lives in code, not the DB, so there is one source of truth. */
  description: string;
}

export const featureFlagRegistry = {
  /** Placeholder so the types aren't `never`. Delete once a real flag exists. */
  FF__EXAMPLE: {
    defaultEnabled: false,
    description: "Example flag. Replace with a real one.",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagName = keyof typeof featureFlagRegistry;

export type FeatureFlags = Record<FeatureFlagName, boolean>;

/**
 * A non-empty tuple so `z.enum(FEATURE_FLAG_NAMES)` typechecks, which is what
 * makes writing an undeclared flag a `BAD_REQUEST`.
 */
export const FEATURE_FLAG_NAMES = Object.keys(featureFlagRegistry) as [
  FeatureFlagName,
  ...FeatureFlagName[],
];

/**
 * The server caches its table read for this long and the web client mirrors it
 * as `staleTime`. Also the window within which a toggle on one instance reaches
 * the others.
 */
export const FEATURE_FLAG_TTL_MS = 30_000;

/** Every flag at its declared default — the value used where no DB row exists. */
export const FEATURE_FLAG_DEFAULTS: FeatureFlags = Object.fromEntries(
  FEATURE_FLAG_NAMES.map((name) => [
    name,
    featureFlagRegistry[name].defaultEnabled,
  ])
) as FeatureFlags;
