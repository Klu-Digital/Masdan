import { hasPermission } from "@masdan/auth/permissions";
import { call, isProcedure, ORPCError } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { procedureAccess } from "../procedures";

export type AskContext = Context & {
  memberRole: string;
  organizationId: string;
  session: NonNullable<Context["session"]>;
};

export interface AskTool {
  access: ReturnType<typeof procedureAccess>;
  inputSchema: z.ZodType | null;
  name: string;
  procedure: AnyProcedure;
  schema: unknown;
  write: boolean;
}

export type AskTools = Map<string, AskTool>;

const REFERENCE_READS = new Set(["currencies.list", "interest.catalog"]);
// Other AI planners can persist drafts or recharge tokens during confirmation.
const AI_PLANNERS = new Set([
  "suggestions.forImport",
  "suggestions.forTransaction",
  "transactions.parseQuickEntry",
]);
const VOLATILE_READS = new Set([
  "attachments.downloadUrl",
  "files.getDownloadUrl",
  "interest.projection",
]);

/** Only the mount point supplies routers; platform/auth routers never enter. */
export const createAskTools = (routers: Record<string, unknown>): AskTools => {
  const tools: AskTools = new Map();
  const visit = (value: unknown, path: string[]) => {
    if (!isProcedure(value)) {
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          visit(child, [...path, key]);
        }
      }
      return;
    }
    const name = path.join(".");
    const access = procedureAccess(value);
    if (
      AI_PLANNERS.has(name) ||
      (!access.household && !REFERENCE_READS.has(name))
    ) {
      return;
    }
    const schema: unknown = value["~orpc"].inputSchema;
    if (schema !== undefined && !(schema instanceof z.ZodType)) {
      throw new Error(`Ask tool ${name} needs a Zod input schema`);
    }
    const inputSchema = schema instanceof z.ZodType ? schema : null;
    tools.set(name, {
      access,
      inputSchema,
      name,
      procedure: value,
      schema: inputSchema
        ? z.toJSONSchema(inputSchema, { io: "input", unrepresentable: "any" })
        : { type: "null" },
      // This endpoint writes upload status without a transaction procedure.
      write: access.write || name === "files.confirmUpload",
    });
  };
  visit(routers, []);
  return tools;
};

export const canUseAskTool = (tool: AskTool, context: AskContext): boolean =>
  tool.access.permissions.every((permissions) =>
    hasPermission({ permissions, role: context.memberRole })
  );

export const askTool = (
  tools: AskTools,
  name: string,
  context: AskContext,
  write: boolean
): AskTool => {
  const tool = tools.get(name);
  if (!tool || tool.write !== write) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That action is not available to Ask Masdan.",
    });
  }
  if (!canUseAskTool(tool, context)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Your household role does not allow that action.",
    });
  }
  return tool;
};

export const parseAskInput = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Ask Masdan produced an invalid action. Try describing it again.",
    });
  }
};

export const validateAskInput = (tool: AskTool, input: unknown): unknown => {
  if (!tool.inputSchema) {
    if (input !== null && input !== undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${tool.name} takes no input.`,
      });
    }
    return null;
  }
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Check ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    });
  }
  return parsed.data;
};

export const callAskTool = async (
  tool: AskTool,
  input: unknown,
  context: AskContext
): Promise<unknown> => {
  validateAskInput(tool, input);
  // call(), never the handler: permissions, flags and transactions still run.
  return await call(tool.procedure, tool.inputSchema ? input : undefined, {
    context,
    path: tool.name.split("."),
  });
};

export const observeAskTool = (tool: AskTool): boolean =>
  tool.access.household && !VOLATILE_READS.has(tool.name);
