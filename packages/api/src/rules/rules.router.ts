import type { Database } from "@masdan/db";
import {
  category,
  financialAccount,
  financialTransaction,
  financialTransactionSplit,
  financialTransactionTag,
  transactionRule,
  transactionRuleTag,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, count, eq, max } from "drizzle-orm";
import { z } from "zod";

import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { notFound } from "../shared/errors";
import { positiveAmount, scaledAmount } from "../shared/money";
import { updateTransaction } from "../transactions/transactions.commands";
import { assertReferences } from "../transactions/transactions.write";
import {
  RULE_TEXT_OPERATORS,
  RULE_TRANSACTION_TYPES,
  applyRuleActions,
  findMatchingRule,
  hasRuleActions,
  hasRuleConditions,
} from "./engine";
import type { RuleSubject, RuleTransactionType } from "./engine";
import { loadRules, runnableRules } from "./rules.data";
import type { StoredRule } from "./rules.data";

const MAX_RULE_TAGS = 20;

const ruleValues = z
  .object({
    actions: z
      .object({
        categoryId: z.uuid().nullable(),
        tagIds: z
          .array(z.uuid())
          .max(MAX_RULE_TAGS)
          .refine((ids) => new Set(ids).size === ids.length, "Duplicate tag"),
      })
      .strict(),
    conditions: z
      .object({
        accountId: z.uuid().nullable(),
        amountMax: positiveAmount.nullable(),
        amountMin: positiveAmount.nullable(),
        text: z
          .object({
            operator: z.enum(RULE_TEXT_OPERATORS),
            value: z.string().trim().min(1, "Enter text to match").max(200),
          })
          .strict()
          .nullable(),
        type: z.enum(RULE_TRANSACTION_TYPES).nullable(),
      })
      .strict(),
    enabled: z.boolean().default(true),
    name: z.string().trim().min(1, "Name is required").max(80),
  })
  .strict()
  .superRefine((value, context) => {
    if (!hasRuleConditions(value.conditions)) {
      context.addIssue({
        code: "custom",
        message: "Add at least one condition",
        path: ["conditions"],
      });
    }
    if (!hasRuleActions(value.actions)) {
      context.addIssue({
        code: "custom",
        message: "Choose a category or tags for the rule to set",
        path: ["actions"],
      });
    }
    const { amountMax, amountMin } = value.conditions;
    if (
      amountMin !== null &&
      amountMax !== null &&
      scaledAmount(amountMin) > scaledAmount(amountMax)
    ) {
      context.addIssue({
        code: "custom",
        message: "The minimum must not exceed the maximum",
        path: ["conditions", "amountMin"],
      });
    }
    // A category is either income or expense, so the rule must say which.
    if (value.actions.categoryId !== null && value.conditions.type === null) {
      context.addIssue({
        code: "custom",
        message: "Choose money in or money out to set a category",
        path: ["conditions", "type"],
      });
    }
  });

type RuleValues = z.output<typeof ruleValues>;

const ruleIdInput = z.object({ ruleId: z.uuid() });
const transactionIdInput = z.object({ transactionId: z.uuid() });

const findRule = async (
  db: Database,
  organizationId: string,
  ruleId: string
): Promise<StoredRule> => {
  const [rule] = await loadRules(db, organizationId, ruleId);
  if (!rule) {
    throw notFound("Rule");
  }
  return rule;
};

/** A category is either income or expense, so it must match the rule's direction. */
const assertRuleReferences = async (
  db: Database,
  organizationId: string,
  values: RuleValues,
  existing?: StoredRule
): Promise<void> => {
  const selected = await assertReferences(
    db,
    organizationId,
    {
      accountId: values.conditions.accountId,
      categoryId: values.actions.categoryId,
      tagIds: values.actions.tagIds,
    },
    existing && {
      accountId: existing.conditions.accountId,
      categoryId: existing.actions.categoryId,
      tagIds: existing.actions.tagIds,
    }
  );
  if (selected && selected.type !== values.conditions.type) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        selected.type === "income"
          ? "An income category needs a money in rule"
          : "An expense category needs a money out rule",
    });
  }
};

const ruleColumns = (values: RuleValues) => ({
  enabled: values.enabled,
  matchAccountId: values.conditions.accountId,
  matchAmountMax: values.conditions.amountMax,
  matchAmountMin: values.conditions.amountMin,
  matchText: values.conditions.text?.value ?? null,
  matchTextOperator: values.conditions.text?.operator ?? null,
  matchType: values.conditions.type,
  name: values.name,
  setCategoryId: values.actions.categoryId,
});

const replaceRuleTags = async (
  db: Database,
  ruleId: string,
  tagIds: string[]
): Promise<void> => {
  await db
    .delete(transactionRuleTag)
    .where(eq(transactionRuleTag.ruleId, ruleId));
  if (tagIds.length > 0) {
    await db
      .insert(transactionRuleTag)
      .values(tagIds.map((tagId) => ({ ruleId, tagId })));
  }
};

interface RuleTarget {
  categoryId: string;
  eligibility: string | null;
  subject: RuleSubject;
  tagIds: string[];
  transaction: {
    accountId: string;
    amount: string;
    id: string;
    notes: string | null;
    paidStatus: "paid" | "unpaid";
    transactionDate: string;
  };
}

/** A saved transaction as the rule engine sees it, or why rules can't touch it. */
const ruleTarget = async (
  db: Database,
  organizationId: string,
  transactionId: string
): Promise<RuleTarget> => {
  const [row] = await db
    .select({
      accountId: financialTransaction.accountId,
      amount: financialTransaction.amount,
      archivedAt: financialTransaction.archivedAt,
      categoryId: financialTransaction.categoryId,
      id: financialTransaction.id,
      notes: financialTransaction.notes,
      paidStatus: financialTransaction.paidStatus,
      transactionDate: financialTransaction.transactionDate,
      transferId: financialTransaction.transferId,
      type: category.type,
    })
    .from(financialTransaction)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, financialTransaction.accountId)
    )
    .leftJoin(category, eq(category.id, financialTransaction.categoryId))
    .where(
      and(
        eq(financialTransaction.id, transactionId),
        eq(financialTransaction.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!row) {
    throw notFound("Transaction");
  }

  const [tagRows, [splitCount]] = await Promise.all([
    db
      .select({ tagId: financialTransactionTag.tagId })
      .from(financialTransactionTag)
      .where(eq(financialTransactionTag.transactionId, row.id)),
    db
      .select({ total: count() })
      .from(financialTransactionSplit)
      .where(eq(financialTransactionSplit.transactionId, row.id)),
  ]);

  let eligibility: string | null = null;
  if (row.transferId !== null || row.categoryId === null) {
    eligibility = "Rules don’t apply to transfers.";
  } else if (row.archivedAt !== null) {
    eligibility = "Restore the transaction before applying rules.";
  } else if ((splitCount?.total ?? 0) > 0) {
    eligibility = "Split transactions keep the categories on their splits.";
  }

  const type: RuleTransactionType =
    row.type === "income" ? "income" : "expense";
  return {
    categoryId: row.categoryId ?? "",
    eligibility,
    subject: {
      accountId: row.accountId,
      amount: row.amount,
      description: row.notes,
      type,
    },
    tagIds: tagRows.map(({ tagId }) => tagId),
    transaction: row,
  };
};

const previewMatch = async (
  db: Database,
  organizationId: string,
  transactionId: string
) => {
  const target = await ruleTarget(db, organizationId, transactionId);
  if (target.eligibility) {
    return { eligibility: target.eligibility, match: null, target };
  }
  const match = findMatchingRule(
    runnableRules(await loadRules(db, organizationId)),
    target.subject
  );
  if (!match) {
    return { eligibility: null, match: null, target };
  }
  const outcome = applyRuleActions(match.rule, {
    categoryId: target.categoryId,
    tagIds: target.tagIds,
  });
  return {
    eligibility: null,
    match: {
      addedTagIds: outcome.addedTagIds,
      categoryChanges: outcome.categoryId !== target.categoryId,
      checks: match.checks,
      outcome,
      rule: match.rule,
    },
    target,
  };
};

export const rulesRouter = {
  /** Runs the rule the caller previewed, through the manual edit path. */
  applyToTransaction: orgMutationProcedure
    .use(requirePermission({ transaction: ["update"] }))
    .input(transactionIdInput.extend({ ruleId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { eligibility, match, target } = await previewMatch(
        context.db,
        context.organizationId,
        input.transactionId
      );
      if (eligibility) {
        throw new ORPCError("BAD_REQUEST", { message: eligibility });
      }
      if (match?.rule.id !== input.ruleId) {
        throw new ORPCError("CONFLICT", {
          message:
            "Your rules changed since this preview. Check the match again.",
        });
      }
      return updateTransaction(
        context.db,
        context.organizationId,
        {
          accountId: target.transaction.accountId,
          amount: target.transaction.amount,
          categoryId: match.outcome.categoryId,
          notes: target.transaction.notes,
          paidStatus: target.transaction.paidStatus,
          tagIds: match.outcome.tagIds,
          transactionDate: target.transaction.transactionDate,
          transactionId: target.transaction.id,
        },
        { ruleApplication: match.outcome.application }
      );
    }),

  create: orgMutationProcedure
    .use(requirePermission({ rule: ["create"] }))
    .input(ruleValues)
    .handler(async ({ context, input }) => {
      await assertRuleReferences(context.db, context.organizationId, input);
      const [last] = await context.db
        .select({ position: max(transactionRule.position) })
        .from(transactionRule)
        .where(eq(transactionRule.organizationId, context.organizationId));
      const [created] = await context.db
        .insert(transactionRule)
        .values({
          ...ruleColumns(input),
          organizationId: context.organizationId,
          position: (last?.position ?? -1) + 1,
        })
        .returning({ id: transactionRule.id });
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create rule",
        });
      }
      await replaceRuleTags(context.db, created.id, input.actions.tagIds);
      return findRule(context.db, context.organizationId, created.id);
    }),

  delete: orgMutationProcedure
    .use(requirePermission({ rule: ["delete"] }))
    .input(ruleIdInput)
    .handler(async ({ context, input }) => {
      const [deleted] = await context.db
        .delete(transactionRule)
        .where(
          and(
            eq(transactionRule.id, input.ruleId),
            eq(transactionRule.organizationId, context.organizationId)
          )
        )
        .returning({ id: transactionRule.id });
      if (!deleted) {
        throw notFound("Rule");
      }
      return { id: deleted.id };
    }),

  list: orgProcedure
    .use(requirePermission({ rule: ["read"] }))
    .handler(({ context }) => loadRules(context.db, context.organizationId)),

  /** Which rule would run on a saved transaction, and what it would change. */
  matchTransaction: orgProcedure
    .use(requirePermission({ rule: ["read"], transaction: ["read"] }))
    .input(transactionIdInput)
    .handler(async ({ context, input }) => {
      const { eligibility, match } = await previewMatch(
        context.db,
        context.organizationId,
        input.transactionId
      );
      return {
        eligibility,
        match: match
          ? {
              addedTagIds: match.addedTagIds,
              categoryChanges: match.categoryChanges,
              checks: match.checks,
              rule: match.rule,
            }
          : null,
      };
    }),

  /** Takes the household's full rule list, top first, so no rule is left unordered. */
  reorder: orgMutationProcedure
    .use(requirePermission({ rule: ["update"] }))
    .input(
      z.object({
        ruleIds: z
          .array(z.uuid())
          .max(500)
          .refine((ids) => new Set(ids).size === ids.length, "Duplicate rule"),
      })
    )
    .handler(async ({ context, input }) => {
      const current = await context.db
        .select({ id: transactionRule.id })
        .from(transactionRule)
        .where(eq(transactionRule.organizationId, context.organizationId))
        .for("update");
      const known = new Set(current.map(({ id }) => id));
      if (
        known.size !== input.ruleIds.length ||
        input.ruleIds.some((id) => !known.has(id))
      ) {
        throw new ORPCError("CONFLICT", {
          message: "Your rules changed. Reload and try again.",
        });
      }
      for (const [position, id] of input.ruleIds.entries()) {
        await context.db
          .update(transactionRule)
          .set({ position })
          .where(
            and(
              eq(transactionRule.id, id),
              eq(transactionRule.organizationId, context.organizationId)
            )
          );
      }
      return loadRules(context.db, context.organizationId);
    }),

  setEnabled: orgMutationProcedure
    .use(requirePermission({ rule: ["update"] }))
    .input(ruleIdInput.extend({ enabled: z.boolean() }))
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(transactionRule)
        .set({ enabled: input.enabled })
        .where(
          and(
            eq(transactionRule.id, input.ruleId),
            eq(transactionRule.organizationId, context.organizationId)
          )
        )
        .returning({ id: transactionRule.id });
      if (!updated) {
        throw notFound("Rule");
      }
      return findRule(context.db, context.organizationId, updated.id);
    }),

  update: orgMutationProcedure
    .use(requirePermission({ rule: ["update"] }))
    .input(ruleValues.extend({ ruleId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const { ruleId, ...values } = input;
      const existing = await findRule(
        context.db,
        context.organizationId,
        ruleId
      );
      await assertRuleReferences(
        context.db,
        context.organizationId,
        values,
        existing
      );
      await context.db
        .update(transactionRule)
        .set(ruleColumns(values))
        .where(
          and(
            eq(transactionRule.id, ruleId),
            eq(transactionRule.organizationId, context.organizationId)
          )
        );
      await replaceRuleTags(context.db, ruleId, values.actions.tagIds);
      return findRule(context.db, context.organizationId, ruleId);
    }),
};
