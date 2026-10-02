// Imported by the web bundle: no `dotenv`, `process.env` or `@masdan/db`.
export interface FeatureFlagDefinition {
  /** Value used until an admin overrides it. A new flag needs no DB row to exist. */
  defaultEnabled: boolean;
  /** Shown in the admin UI. Lives in code, not the DB, so there is one source of truth. */
  description: string;
}

export const featureFlagRegistry = {
  FF__AI_CATEGORIZATION: {
    defaultEnabled: false,
    description:
      "AI category and tag suggestions for transactions and import review.",
  },
  FF__ASK_MASDAN: {
    defaultEnabled: false,
    description:
      "Ask Masdan: natural-language questions answered from household reports.",
  },
  FF__CHAT_ENTRY: {
    defaultEnabled: false,
    description:
      "Chat entry: link a chat app (Telegram, …) and add transactions by message.",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagName = keyof typeof featureFlagRegistry;

export type FeatureFlags = Record<FeatureFlagName, boolean>;

export const FEATURE_FLAG_NAMES = Object.keys(featureFlagRegistry) as [
  FeatureFlagName,
  ...FeatureFlagName[],
];

export const FEATURE_FLAG_TTL_MS = 30_000;

/** Every flag at its declared default — the value used where no DB row exists. */
export const FEATURE_FLAG_DEFAULTS: FeatureFlags = Object.fromEntries(
  FEATURE_FLAG_NAMES.map((name) => [
    name,
    featureFlagRegistry[name].defaultEnabled,
  ])
) as FeatureFlags;
