import { log, parseError } from "@masdan/observability";
import { z } from "zod";

import { AiError, completeJson, isAiConfigured } from "../ai/gateway";
import {
  assertPermission,
  orgProcedure,
  rateLimit,
  requireFlag,
  requirePermission,
} from "../procedures";
import {
  ASK_QUESTION_MAX_LENGTH,
  askExtraction,
  askMessages,
  resolveAskPlan,
} from "./ask.plan";
import { askHousehold, runAskQuery } from "./ask.queries";
import type { AskAnswer } from "./ask.queries";

/** Long enough for a slow model, short enough to beat opening Reports by hand. */
const ASK_AI_TIMEOUT_MS = 10_000;

export type AskResult =
  | { answer: AskAnswer; status: "answered" }
  | { message: string; options: string[]; status: "clarify" }
  | { message: string; status: "unavailable" | "unsupported" };

const UNAVAILABLE_MESSAGE =
  "Ask Masdan can’t answer right now. Reports and Transactions have the same numbers.";

const OVER_BUDGET_MESSAGE =
  "Your household has used today’s AI allowance. Ask again tomorrow; Reports and Transactions have the same numbers.";

export const askRouter = {
  /**
   * Read-only. The model picks one of a fixed set of report queries and names
   * what to filter on; the household comes from the session, every name is
   * matched against that household's rows, and the answer is worded from
   * query results. Any AI failure is `unavailable`, never a guessed answer.
   */
  question: orgProcedure
    .use(requireFlag("FF__ASK_MASDAN"))
    .use(requirePermission({ transaction: ["read"] }))
    .use(rateLimit({ limit: 20, window: 60 }))
    .input(
      z.object({
        question: z.string().trim().min(1).max(ASK_QUESTION_MAX_LENGTH),
      })
    )
    .handler(async ({ context, input }): Promise<AskResult> => {
      if (!isAiConfigured("askMasdan")) {
        return { message: UNAVAILABLE_MESSAGE, status: "unavailable" };
      }
      const household = await askHousehold(context.db, context.organizationId);

      let extraction: z.output<typeof askExtraction>;
      try {
        extraction = await completeJson({
          feature: "askMasdan",
          household: {
            db: context.db,
            organizationId: context.organizationId,
          },
          messages: askMessages(input.question, household),
          name: "ask_masdan",
          schema: askExtraction,
          timeoutMs: ASK_AI_TIMEOUT_MS,
        });
      } catch (error) {
        // The question is financial and never logged; the failure kind is enough.
        log.warn({ action: "ask.ai.failed", ...parseError(error) });
        const overBudget =
          error instanceof AiError && error.reason === "over_budget";
        return {
          message: overBudget ? OVER_BUDGET_MESSAGE : UNAVAILABLE_MESSAGE,
          status: "unavailable",
        };
      }

      const plan = resolveAskPlan(input.question, household, extraction);
      if (plan.status !== "ready") {
        return plan.status === "clarify"
          ? plan
          : { message: plan.message, status: "unsupported" };
      }
      if (
        plan.query.intent === "net_worth" ||
        plan.query.intent === "account_balances"
      ) {
        assertPermission(context, { financialAccount: ["read"] });
      }

      return {
        answer: await runAskQuery(
          context.db,
          context.organizationId,
          household,
          plan.query
        ),
        status: "answered",
      };
    }),
};
