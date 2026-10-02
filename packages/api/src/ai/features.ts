import { env } from "@masdan/env/integrations";
import type { ReasoningEffort } from "openai/resources/shared";

// Callers name a feature, never a model, so each can move independently.
export const AI_FEATURES = {
  askMasdan: {
    defaultMaxTokens: 500,
    label: "Ask Masdan",
    model: () => env.ASK_MASDAN_AI_MODEL,
    reasoningEffort: "medium",
  },
  categorize: {
    defaultMaxTokens: 8000,
    label: "Category suggestions",
    model: () => env.CATEGORIZE_AI_MODEL,
    reasoningEffort: "low",
  },
  quickTransaction: {
    defaultMaxTokens: 500,
    label: "Quick entry",
    model: () => env.QUICK_TRANSACTION_AI_MODEL,
    reasoningEffort: "none",
  },
  receipt: {
    defaultMaxTokens: 800,
    label: "Receipts",
    model: () => env.RECEIPT_AI_MODEL,
    reasoningEffort: "none",
  },
} satisfies Record<
  string,
  {
    defaultMaxTokens: number;
    label: string;
    model: () => string | undefined;
    reasoningEffort: ReasoningEffort;
  }
>;

export type AiFeature = keyof typeof AI_FEATURES;

export const AI_FEATURE_NAMES = Object.keys(AI_FEATURES) as [
  AiFeature,
  ...AiFeature[],
];

/** Below this a JSON answer cannot fit; above it one call could eat a day's budget. */
export const MIN_MAX_TOKENS = 64;
export const MAX_MAX_TOKENS = 32_000;

export type AiTokenCaps = Record<AiFeature, number>;

export const DEFAULT_AI_TOKEN_CAPS = Object.fromEntries(
  AI_FEATURE_NAMES.map((name) => [name, AI_FEATURES[name].defaultMaxTokens])
) as AiTokenCaps;
