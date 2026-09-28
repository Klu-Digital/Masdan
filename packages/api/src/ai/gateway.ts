import { env } from "@masdan/env/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

/**
 * Every AI call goes through Cloudflare AI Gateway's OpenAI-compatible
 * endpoint, server-side only. Callers name a feature, never a model: each
 * feature reads its own variable, so one can move to a cheaper or stronger
 * model — or another provider — without touching the others or its caller.
 */
const FEATURE_MODELS = {
  askMasdan: () => env.ASK_MASDAN_AI_MODEL,
  quickTransaction: () => env.QUICK_TRANSACTION_AI_MODEL,
} satisfies Record<string, () => string | undefined>;

export type AiFeature = keyof typeof FEATURE_MODELS;

/**
 * `unavailable`: no gateway or model is configured for the feature.
 * `malformed`: the model answered, but not with JSON matching the schema.
 * Transport errors and timeouts surface as the SDK's own errors.
 */
export class AiError extends Error {
  readonly reason: "malformed" | "unavailable";

  constructor(reason: "malformed" | "unavailable", message: string) {
    super(message);
    this.name = "AiError";
    this.reason = reason;
  }
}

export const isAiConfigured = (feature: AiFeature): boolean =>
  Boolean(env.CLOUDFLARE_AI_GATEWAY_URL && FEATURE_MODELS[feature]());

const gatewayClient = (baseURL: string): OpenAI =>
  new OpenAI({
    // BYOK and unified billing authenticate upstream at the gateway, so the
    // placeholder is never sent: the null header below drops it.
    apiKey: env.AI_PROVIDER_API_KEY ?? "gateway-managed",
    baseURL,
    defaultHeaders: {
      ...(env.AI_PROVIDER_API_KEY ? {} : { Authorization: null }),
      ...(env.CLOUDFLARE_AI_GATEWAY_TOKEN
        ? {
            "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
          }
        : {}),
    },
    // A retry would outlive the caller's timeout; callers fall back instead.
    maxRetries: 0,
  });

/**
 * One chat completion constrained to `schema`. Throws `AiError`, or the SDK's
 * own error on transport failure or timeout — the result is only ever
 * returned after `schema` has parsed it.
 */
export const completeJson = async <Schema extends z.ZodType>({
  feature,
  messages,
  name,
  schema,
  timeoutMs,
}: {
  feature: AiFeature;
  messages: ChatCompletionMessageParam[];
  name: string;
  schema: Schema;
  timeoutMs: number;
}): Promise<z.output<Schema>> => {
  const model = FEATURE_MODELS[feature]();
  if (!(env.CLOUDFLARE_AI_GATEWAY_URL && model)) {
    throw new AiError("unavailable", `AI is not configured for ${feature}`);
  }

  const completion = await gatewayClient(
    env.CLOUDFLARE_AI_GATEWAY_URL
  ).chat.completions.create(
    {
      messages,
      model,
      response_format: {
        json_schema: {
          name,
          schema: z.toJSONSchema(schema, { io: "input" }),
          strict: true,
        },
        type: "json_schema",
      },
      temperature: 0,
    },
    { timeout: timeoutMs }
  );

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new AiError("malformed", "The model returned no content");
  }
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new AiError("malformed", "The model returned invalid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AiError("malformed", "The model's JSON did not match the schema");
  }
  return parsed.data;
};
