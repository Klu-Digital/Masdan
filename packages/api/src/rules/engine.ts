import type {
  TransactionRuleApplication,
  TransactionRuleConditions,
} from "@masdan/db/schema/rules";

import { scaledAmount } from "../shared/money";

// Leaf module: shared with the import worker and the web rule tester.

export const RULE_TEXT_OPERATORS = [
  "contains",
  "equals",
  "startsWith",
] as const;
export type RuleTextOperator = (typeof RULE_TEXT_OPERATORS)[number];

export const RULE_TEXT_OPERATOR_LABELS: Record<RuleTextOperator, string> = {
  contains: "contains",
  equals: "is exactly",
  startsWith: "starts with",
};

export const RULE_TRANSACTION_TYPES = ["expense", "income"] as const;
export type RuleTransactionType = (typeof RULE_TRANSACTION_TYPES)[number];

export type RuleConditions = TransactionRuleConditions;
export type RuleApplication = TransactionRuleApplication;

export interface RuleActions {
  /** `null` leaves the category alone. */
  categoryId: string | null;
  /** Added to the transaction's tags; existing tags are never removed. */
  tagIds: string[];
}

export interface EvaluableRule {
  actions: RuleActions;
  conditions: RuleConditions;
  enabled: boolean;
  id: string;
  name: string;
  position: number;
}

/** The fields a rule can see, whether on a saved transaction or an import row. */
export interface RuleSubject {
  accountId: string | null;
  /** Positive decimal string. */
  amount: string;
  /** The transaction's note — for imports, the description plus notes. */
  description: string | null;
  type: RuleTransactionType;
}

type RuleConditionField = "account" | "amount" | "description" | "type";

export interface RuleConditionCheck {
  field: RuleConditionField;
  matched: boolean;
}

export interface RuleMatch<R extends EvaluableRule = EvaluableRule> {
  checks: RuleConditionCheck[];
  rule: R;
}

const WHITESPACE = /\s+/gu;

/** Case- and spacing-insensitive, so "GRAB  Ride" and "grab ride" compare equal. */
const normalizeRuleText = (value: string | null): string =>
  (value ?? "").toLowerCase().replaceAll(WHITESPACE, " ").trim();

const textMatches = (
  operator: RuleTextOperator,
  pattern: string,
  value: string | null
): boolean => {
  const haystack = normalizeRuleText(value);
  const needle = normalizeRuleText(pattern);
  if (operator === "equals") {
    return haystack === needle;
  }
  if (operator === "startsWith") {
    return haystack.startsWith(needle);
  }
  return haystack.includes(needle);
};

export const hasRuleConditions = (conditions: RuleConditions): boolean =>
  conditions.text !== null ||
  conditions.type !== null ||
  conditions.accountId !== null ||
  conditions.amountMin !== null ||
  conditions.amountMax !== null;

export const hasRuleActions = (actions: RuleActions): boolean =>
  actions.categoryId !== null || actions.tagIds.length > 0;

/** One check per configured condition, in a fixed order. */
export const checkRuleConditions = (
  conditions: RuleConditions,
  subject: RuleSubject
): RuleConditionCheck[] => {
  const checks: RuleConditionCheck[] = [];
  if (conditions.text) {
    checks.push({
      field: "description",
      matched: textMatches(
        conditions.text.operator,
        conditions.text.value,
        subject.description
      ),
    });
  }
  if (conditions.type) {
    checks.push({ field: "type", matched: subject.type === conditions.type });
  }
  if (conditions.accountId) {
    checks.push({
      field: "account",
      matched: subject.accountId === conditions.accountId,
    });
  }
  if (conditions.amountMin !== null || conditions.amountMax !== null) {
    const amount = scaledAmount(subject.amount);
    checks.push({
      field: "amount",
      matched:
        (conditions.amountMin === null ||
          amount >= scaledAmount(conditions.amountMin)) &&
        (conditions.amountMax === null ||
          amount <= scaledAmount(conditions.amountMax)),
    });
  }
  return checks;
};

/** A rule with no conditions never matches: it would silently catch everything. */
export const ruleMatches = (
  rule: EvaluableRule,
  subject: RuleSubject
): boolean => {
  if (!rule.enabled) {
    return false;
  }
  const checks = checkRuleConditions(rule.conditions, subject);
  return checks.length > 0 && checks.every(({ matched }) => matched);
};

/** Explicit precedence: position, then id — never the order rows came back in. */
const compareRules = (
  left: Pick<EvaluableRule, "id" | "position">,
  right: Pick<EvaluableRule, "id" | "position">
): number => {
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
};

export const sortRules = <R extends EvaluableRule>(rules: readonly R[]): R[] =>
  rules.toSorted(compareRules);

/** First enabled rule, in precedence order, whose every condition holds. */
export const findMatchingRule = <R extends EvaluableRule>(
  rules: readonly R[],
  subject: RuleSubject
): RuleMatch<R> | null => {
  for (const rule of sortRules(rules)) {
    if (ruleMatches(rule, subject)) {
      return { checks: checkRuleConditions(rule.conditions, subject), rule };
    }
  }
  return null;
};

export interface RuleOutcome {
  application: RuleApplication;
  categoryId: string;
  /** Tags the rule added that the transaction didn't already have. */
  addedTagIds: string[];
  tagIds: string[];
}

/** Only the fields the rule configures change; everything else passes through. */
export const applyRuleActions = (
  rule: Pick<EvaluableRule, "actions" | "conditions" | "id" | "name">,
  current: { categoryId: string; tagIds: readonly string[] }
): RuleOutcome => {
  const addedTagIds = rule.actions.tagIds.filter(
    (tagId) => !current.tagIds.includes(tagId)
  );
  return {
    addedTagIds,
    application: {
      categoryId: rule.actions.categoryId,
      conditions: rule.conditions,
      ruleId: rule.id,
      ruleName: rule.name,
      tagIds: [...rule.actions.tagIds],
    },
    categoryId: rule.actions.categoryId ?? current.categoryId,
    tagIds: [...current.tagIds, ...addedTagIds],
  };
};

export const ruleApplicationHolds = (
  application: Pick<RuleApplication, "categoryId" | "tagIds">,
  values: { categoryId: string; tagIds: readonly string[] }
): boolean =>
  (application.categoryId === null ||
    application.categoryId === values.categoryId) &&
  application.tagIds.every((tagId) => values.tagIds.includes(tagId));

const quote = (value: string): string => `“${value}”`;

export const describeRuleConditions = (
  conditions: RuleConditions,
  names: {
    account?: (accountId: string) => string | undefined;
    formatAmount?: (amount: string) => string;
  } = {}
): string[] => {
  const formatAmount = names.formatAmount ?? ((amount: string) => amount);
  const reasons: string[] = [];
  if (conditions.text) {
    reasons.push(
      `Description ${RULE_TEXT_OPERATOR_LABELS[conditions.text.operator]} ${quote(conditions.text.value)}`
    );
  }
  if (conditions.type) {
    reasons.push(conditions.type === "income" ? "Money in" : "Money out");
  }
  if (conditions.accountId) {
    reasons.push(
      `Account is ${names.account?.(conditions.accountId) ?? "a specific account"}`
    );
  }
  const { amountMax, amountMin } = conditions;
  if (amountMin !== null && amountMax !== null) {
    reasons.push(
      scaledAmount(amountMin) === scaledAmount(amountMax)
        ? `Amount is ${formatAmount(amountMin)}`
        : `Amount between ${formatAmount(amountMin)} and ${formatAmount(amountMax)}`
    );
  } else if (amountMin !== null) {
    reasons.push(`Amount at least ${formatAmount(amountMin)}`);
  } else if (amountMax !== null) {
    reasons.push(`Amount at most ${formatAmount(amountMax)}`);
  }
  return reasons;
};
