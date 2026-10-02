import { env } from "@masdan/env/integrations";
import { log, parseError } from "@masdan/observability";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

import { AI_FEATURES } from "./features";
import type { AiFeature } from "./features";
import { getAiTokenCaps } from "./token-caps.cache";
import { hasAiBudget, recordAiUsage } from "./usage";
import type { AiHousehold } from "./usage";

type AiErrorReason = "malformed" | "over_budget" | "unavailable";

export class AiError extends Error {
  readonly reason: AiErrorReason;

  constructor(reason: AiErrorReason, message: string) {
    super(message);
    this.name = "AiError";
    this.reason = reason;
  }
}

export const isAiConfigured = (feature: AiFeature): boolean =>
  Boolean(
    env.CLOUDFLARE_AI_GATEWAY_URL &&
    AI_FEATURES[feature].model() &&
    env.AI_DAILY_TOKEN_BUDGET > 0
  );

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

/** Throws `AiError`; only returns once `schema` has parsed the answer. */
export const completeJson = async <Schema extends z.ZodType>({
  feature,
  household,
  messages,
  name,
  schema,
  timeoutMs,
}: {
  feature: AiFeature;
  household: AiHousehold;
  messages: ChatCompletionMessageParam[];
  name: string;
  schema: Schema;
  timeoutMs: number;
}): Promise<z.output<Schema>> => {
  const model = AI_FEATURES[feature].model();
  if (!(env.CLOUDFLARE_AI_GATEWAY_URL && model)) {
    throw new AiError("unavailable", `AI is not configured for ${feature}`);
  }
  if (!(await hasAiBudget(household))) {
    throw new AiError(
      "over_budget",
      "The household has used today's AI token budget"
    );
  }
  const caps = await getAiTokenCaps(household.db);
  const maxTokens = caps[feature];

  const completion = await gatewayClient(
    env.CLOUDFLARE_AI_GATEWAY_URL
  ).chat.completions.create(
    {
      max_tokens: maxTokens,
      messages,
      model,
      reasoning_effort: AI_FEATURES[feature].reasoningEffort,
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

  try {
    // A provider that reports no usage is charged the answer's cap.
    await recordAiUsage(household, completion.usage?.total_tokens ?? maxTokens);
  } catch (error) {
    // The tokens are spent either way; losing the answer too helps no one.
    log.error({
      action: "ai.usage.record_failed",
      feature,
      ...parseError(error),
    });
  }

  const [choice] = completion.choices;
  if (choice?.finish_reason === "length") {
    throw new AiError("malformed", `The answer hit ${feature}'s token cap`);
  }
  const content = choice?.message.content;
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
