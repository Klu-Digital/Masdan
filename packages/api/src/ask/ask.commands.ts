import type { AskOutcome } from "@masdan/db/schema/ask";
import { askTurn } from "@masdan/db/schema/index";
import { log, parseError } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { askHash, askResultText, resolveAskReferences } from "./ask.assistant";
import { askTool, callAskTool, parseAskInput } from "./ask.tools";
import type { AskContext, AskTools } from "./ask.tools";

export interface AskApplied {
  message: string;
  outcomes: AskOutcome[];
  requestId: string;
  status: "applied";
}

const ownedTurn = (context: AskContext, requestId: string) =>
  and(
    eq(askTurn.id, requestId),
    eq(askTurn.organizationId, context.organizationId),
    eq(askTurn.userId, context.session.user.id)
  );

const isSerializationFailure = (error: unknown): boolean => {
  let cause = error;
  for (
    let depth = 0;
    depth < 5 && cause && typeof cause === "object";
    depth += 1
  ) {
    if ("code" in cause && (cause.code === "40001" || cause.code === "40P01")) {
      return true;
    }
    cause = "cause" in cause ? cause.cause : null;
  }
  return false;
};

export const confirmAskChanges = async (
  context: AskContext,
  tools: AskTools,
  requestId: string
): Promise<AskApplied> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tasks: (() => Promise<unknown>)[] = [];
    try {
      const result = await context.db.transaction(
        async (db): Promise<AskApplied> => {
          const transactionContext = {
            ...context,
            afterCommit: (task: () => Promise<unknown>) => {
              tasks.push(task);
            },
            db,
          };
          const [turn] = await db
            .select()
            .from(askTurn)
            .where(ownedTurn(context, requestId))
            .for("update")
            .limit(1);
          if (!turn?.actions) {
            throw new ORPCError("NOT_FOUND", {
              message: "That proposal is not in your active household.",
            });
          }
          if (turn.appliedAt && turn.outcomes) {
            return {
              message:
                "These changes have been saved. Check the results below for any skipped records.",
              outcomes: turn.outcomes,
              requestId,
              status: "applied",
            };
          }
          if (turn.cancelledAt || turn.expiresAt.getTime() <= Date.now()) {
            throw new ORPCError("PRECONDITION_FAILED", {
              message:
                "This proposal was cancelled or expired. Ask again for a fresh preview.",
            });
          }
          // Check every permission before executing even the first action.
          for (const action of turn.actions) {
            askTool(tools, action.tool, transactionContext, true);
          }
          for (const observation of turn.observations) {
            const tool = askTool(
              tools,
              observation.tool,
              transactionContext,
              false
            );
            const data = await callAskTool(
              tool,
              parseAskInput(observation.input),
              transactionContext
            );
            if (askHash(data) !== observation.hash) {
              throw new ORPCError("CONFLICT", {
                message:
                  "Your household data changed since this preview. Ask again before applying changes.",
              });
            }
          }
          const rawOutcomes: unknown[] = [];
          const outcomes: AskOutcome[] = [];
          for (const [index, action] of turn.actions.entries()) {
            const tool = askTool(tools, action.tool, transactionContext, true);
            const input = resolveAskReferences(
              parseAskInput(action.input),
              index,
              rawOutcomes
            );
            const data = await callAskTool(tool, input, transactionContext);
            rawOutcomes.push(data);
            outcomes.push({ result: askResultText(data), tool: tool.name });
          }
          await db
            .update(askTurn)
            .set({ appliedAt: new Date(), outcomes })
            .where(ownedTurn(context, requestId));
          return {
            message:
              "These changes have been saved. Check the results below for any skipped records.",
            outcomes,
            requestId,
            status: "applied",
          };
        },
        { isolationLevel: "serializable" }
      );
      for (const task of tasks) {
        await task().catch((error: unknown) => {
          log.error({
            action: "ask.after_commit.failed",
            ...parseError(error),
          });
        });
      }
      log.info({
        action: "ask.changes.applied",
        actorId: context.session.user.id,
        organizationId: context.organizationId,
        requestId,
        tools: result.outcomes.map((outcome) => outcome.tool),
      });
      return result;
    } catch (error) {
      if (!isSerializationFailure(error)) {
        throw error;
      }
    }
  }
  throw new ORPCError("CONFLICT", {
    message:
      "Someone else is changing these records. Nothing was saved; try confirming again.",
  });
};

export const cancelAskChanges = async (
  context: AskContext,
  requestId: string
): Promise<{ requestId: string; status: "cancelled" }> => {
  const [turn] = await context.db
    .update(askTurn)
    .set({ cancelledAt: new Date() })
    .where(and(ownedTurn(context, requestId), isNull(askTurn.appliedAt)))
    .returning({ id: askTurn.id });
  if (!turn) {
    throw new ORPCError("CONFLICT", {
      message: "That proposal is missing or has already been applied.",
    });
  }
  return { requestId, status: "cancelled" };
};
