import { log, parseError } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { AiError, isAiConfigured } from "../ai/gateway";
import {
  orgMutationProcedure,
  orgProcedure,
  rateLimit,
  requireFlag,
  requirePermission,
} from "../procedures";
import { runAskAssistant } from "./ask.assistant";
import type { AskResult } from "./ask.assistant";
import { cancelAskChanges, confirmAskChanges } from "./ask.commands";
import { ASK_QUESTION_MAX_LENGTH } from "./ask.plan";
import { askHousehold } from "./ask.queries";
import type { AskTools } from "./ask.tools";

export type { AskResult } from "./ask.assistant";

const requestInput = z.strictObject({ requestId: z.uuid() });
const askProcedure = orgProcedure
  .use(requireFlag("FF__ASK_MASDAN"))
  .use(requirePermission({ transaction: ["read"] }));

export const createAskRouter = (tools: AskTools) => ({
  cancel: orgMutationProcedure
    .use(requireFlag("FF__ASK_MASDAN"))
    .use(requirePermission({ transaction: ["read"] }))
    .input(requestInput)
    .handler(({ context, input }) =>
      cancelAskChanges(context, input.requestId)
    ),

  // The command owns the serializable batch; no model runs in its transaction.
  confirm: askProcedure
    .use(rateLimit({ limit: 20, window: 60 }))
    .input(requestInput)
    .handler(({ context, input }) =>
      confirmAskChanges(context, tools, input.requestId)
    ),

  question: askProcedure
    .use(rateLimit({ limit: 20, window: 60 }))
    .input(
      z.strictObject({
        previousId: z.uuid().optional(),
        question: z.string().trim().min(1).max(ASK_QUESTION_MAX_LENGTH),
      })
    )
    .handler(async ({ context, input }): Promise<AskResult> => {
      if (!isAiConfigured("askMasdan")) {
        return {
          message:
            "Ask Masdan is unavailable right now. You can still use Masdan’s normal screens; nothing was changed.",
          requestId: null,
          status: "unavailable",
        };
      }
      const household = await askHousehold(context.db, context.organizationId);
      try {
        return await runAskAssistant(
          context,
          tools,
          household,
          input.question,
          input.previousId
        );
      } catch (error) {
        if (error instanceof ORPCError) {
          throw error;
        }
        const reason = error instanceof AiError ? error.reason : "unavailable";
        log.warn({ action: "ask.ai.failed", reason, ...parseError(error) });
        return {
          message:
            reason === "over_budget"
              ? "Today’s AI allowance is used up. Ask again tomorrow; nothing was changed."
              : "Ask Masdan couldn’t finish that request. Try again; nothing was changed.",
          requestId: null,
          status: "unavailable",
        };
      }
    }),
});
