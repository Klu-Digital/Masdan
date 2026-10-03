import { applyRuleActions, findMatchingRule } from "@masdan/api/rules/engine";
import type { RuleSubject } from "@masdan/api/rules/engine";
import { formatScaledAmount } from "@masdan/api/shared/money";

import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

import { categoryOf, transactionDetails } from "../ledger";
import type { Section } from "../router";
import { ruleView, ruleViews, runnableRules } from "../rule-views";
import { db } from "../store";
import type { Rule } from "../store";
import { badRequest, find, newId, scaled } from "../util";
import { updatePosting } from "./transactions";

type RuleView = RouterOutputs["rules"]["list"][number];
type RuleValues = RouterInputs["rules"]["create"];

const normalized = (value: string | null) =>
  value === null ? null : formatScaledAmount(scaled(value));

const ruleValues = (values: RuleValues) => {
  const category = categoryOf(values.actions.categoryId);
  if (values.actions.categoryId !== null && values.conditions.type === null) {
    throw badRequest("Choose money in or money out to set a category");
  }
  if (category && category.type !== values.conditions.type) {
    throw badRequest(
      category.type === "income"
        ? "An income category needs a money in rule"
        : "An expense category needs a money out rule"
    );
  }
  return {
    actions: values.actions,
    conditions: {
      ...values.conditions,
      amountMax: normalized(values.conditions.amountMax),
      amountMin: normalized(values.conditions.amountMin),
    },
    enabled: values.enabled ?? true,
    name: values.name,
  };
};

const previewMatch = (transactionId: string) => {
  const posting = find(db().transactions, transactionId, "Transaction");
  let eligibility: string | null = null;
  if (posting.transferId !== null || posting.categoryId === null) {
    eligibility = "Rules don’t apply to transfers.";
  } else if (posting.archivedAt !== null) {
    eligibility = "Restore the transaction before applying rules.";
  } else if (posting.splits.length > 0) {
    eligibility = "Split transactions keep the categories on their splits.";
  }
  if (eligibility) {
    return { eligibility, match: null, posting };
  }
  const subject: RuleSubject = {
    accountId: posting.accountId,
    amount: formatScaledAmount(scaled(posting.amount)),
    description: posting.notes,
    type:
      categoryOf(posting.categoryId)?.type === "income" ? "income" : "expense",
  };
  const match = findMatchingRule(runnableRules(), subject);
  if (!match) {
    return { eligibility: null, match: null, posting };
  }
  const outcome = applyRuleActions(match.rule, {
    categoryId: posting.categoryId ?? "",
    tagIds: posting.tagIds,
  });
  return {
    eligibility: null,
    match: {
      addedTagIds: outcome.addedTagIds,
      categoryChanges: outcome.categoryId !== posting.categoryId,
      checks: match.checks,
      outcome,
      rule: match.rule,
    },
    posting,
  };
};

const change = (ruleId: string, values: Partial<Rule>): RuleView => {
  const rule = find(db().rules, ruleId, "Rule");
  Object.assign(rule, values, { updatedAt: new Date() });
  return ruleView(rule);
};

export const rules: Section<"rules"> = {
  applyToTransaction: ({ ruleId, transactionId }) => {
    const { eligibility, match, posting } = previewMatch(transactionId);
    if (eligibility) {
      throw badRequest(eligibility);
    }
    if (match?.rule.id !== ruleId) {
      throw badRequest(
        "Your rules changed since this preview. Check the match again."
      );
    }
    const updated = updatePosting(
      {
        accountId: posting.accountId,
        amount: posting.amount,
        categoryId: match.outcome.categoryId,
        notes: posting.notes,
        paidStatus: posting.paidStatus,
        tagIds: match.outcome.tagIds,
        transactionDate: posting.transactionDate,
        transactionId: posting.id,
      },
      { ruleApplication: match.outcome.application }
    );
    return transactionDetails(updated);
  },

  create: (input) => {
    const now = new Date();
    const rule: Rule = {
      ...ruleValues(input),
      createdAt: now,
      id: newId(),
      position: Math.max(-1, ...db().rules.map((row) => row.position)) + 1,
      updatedAt: now,
    };
    db().rules.push(rule);
    return ruleView(rule);
  },

  delete: ({ ruleId }) => {
    find(db().rules, ruleId, "Rule");
    db().rules = db().rules.filter((row) => row.id !== ruleId);
    return { id: ruleId };
  },

  list: ruleViews,

  matchTransaction: ({ transactionId }) => {
    const { eligibility, match } = previewMatch(transactionId);
    return {
      eligibility,
      match: match && {
        addedTagIds: match.addedTagIds,
        categoryChanges: match.categoryChanges,
        checks: match.checks,
        rule: match.rule,
      },
    };
  },

  reorder: ({ ruleIds }) => {
    const known = new Set(db().rules.map((row) => row.id));
    if (known.size !== ruleIds.length || ruleIds.some((id) => !known.has(id))) {
      throw badRequest("Your rules changed. Reload and try again.");
    }
    for (const [position, id] of ruleIds.entries()) {
      find(db().rules, id, "Rule").position = position;
    }
    return ruleViews();
  },

  setEnabled: ({ enabled, ruleId }) => change(ruleId, { enabled }),

  update: ({ ruleId, ...values }) => change(ruleId, ruleValues(values)),
};
