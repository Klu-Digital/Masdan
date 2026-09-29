import type { Database } from "@masdan/db";
import {
  category,
  tag,
  transactionRule,
  transactionRuleTag,
} from "@masdan/db/schema/index";
import { and, asc, eq } from "drizzle-orm";

import { formatScaledAmount, scaledAmount } from "../shared/money";
import { sortRules } from "./engine";
import type { EvaluableRule } from "./engine";

/**
 * Rule reads shared by the rules router and the import worker. Kept free of
 * the procedure ladder so apps/workers can import it.
 */

export interface StoredRule extends EvaluableRule {
  category: {
    archivedAt: Date | null;
    color: string;
    icon: string;
    id: string;
    name: string;
    type: string;
  } | null;
  createdAt: Date;
  /** Why an enabled rule is skipped; `null` when it can run. */
  problem: string | null;
  tags: { archivedAt: Date | null; color: string; id: string; name: string }[];
  updatedAt: Date;
}

/** numeric(30,6) reads back as "12.500000"; the engine wants "12.5". */
const normalizedAmount = (value: string | null): string | null =>
  value === null ? null : formatScaledAmount(scaledAmount(value));

const ruleProblem = (rule: Omit<StoredRule, "problem">): string | null => {
  if (rule.category?.archivedAt) {
    return `Its category “${rule.category.name}” is archived`;
  }
  if (rule.category && rule.category.type !== rule.conditions.type) {
    return `“${rule.category.name}” is no longer a money ${rule.conditions.type === "income" ? "in" : "out"} category`;
  }
  const archivedTag = rule.tags.find((item) => item.archivedAt !== null);
  if (archivedTag) {
    return `Its tag “${archivedTag.name}” is archived`;
  }
  return null;
};

/** Every rule in the household, in precedence order; with `onlyRuleId`, just that one. */
export const loadRules = async (
  db: Database,
  organizationId: string,
  onlyRuleId?: string
): Promise<StoredRule[]> => {
  const [rows, tagRows] = await Promise.all([
    db
      .select({
        categoryArchivedAt: category.archivedAt,
        categoryColor: category.color,
        categoryIcon: category.icon,
        categoryName: category.name,
        categoryType: category.type,
        createdAt: transactionRule.createdAt,
        enabled: transactionRule.enabled,
        id: transactionRule.id,
        matchAccountId: transactionRule.matchAccountId,
        matchAmountMax: transactionRule.matchAmountMax,
        matchAmountMin: transactionRule.matchAmountMin,
        matchText: transactionRule.matchText,
        matchTextOperator: transactionRule.matchTextOperator,
        matchType: transactionRule.matchType,
        name: transactionRule.name,
        position: transactionRule.position,
        setCategoryId: transactionRule.setCategoryId,
        updatedAt: transactionRule.updatedAt,
      })
      .from(transactionRule)
      .leftJoin(category, eq(category.id, transactionRule.setCategoryId))
      .where(
        and(
          eq(transactionRule.organizationId, organizationId),
          onlyRuleId ? eq(transactionRule.id, onlyRuleId) : undefined
        )
      )
      .orderBy(asc(transactionRule.position), asc(transactionRule.id)),
    db
      .select({
        archivedAt: tag.archivedAt,
        color: tag.color,
        id: tag.id,
        name: tag.name,
        ruleId: transactionRuleTag.ruleId,
      })
      .from(transactionRuleTag)
      .innerJoin(
        transactionRule,
        eq(transactionRule.id, transactionRuleTag.ruleId)
      )
      .innerJoin(tag, eq(tag.id, transactionRuleTag.tagId))
      .where(
        and(
          eq(transactionRule.organizationId, organizationId),
          onlyRuleId ? eq(transactionRule.id, onlyRuleId) : undefined
        )
      )
      .orderBy(asc(tag.name)),
  ]);

  const tagsByRule = new Map<string, StoredRule["tags"]>();
  for (const { ruleId, ...item } of tagRows) {
    tagsByRule.set(ruleId, [...(tagsByRule.get(ruleId) ?? []), item]);
  }

  return sortRules(
    rows.map((row) => {
      const tags = tagsByRule.get(row.id) ?? [];
      const rule: Omit<StoredRule, "problem"> = {
        actions: {
          categoryId: row.setCategoryId,
          tagIds: tags.map(({ id }) => id),
        },
        category:
          row.setCategoryId &&
          row.categoryName !== null &&
          row.categoryColor !== null &&
          row.categoryIcon !== null &&
          row.categoryType !== null
            ? {
                archivedAt: row.categoryArchivedAt,
                color: row.categoryColor,
                icon: row.categoryIcon,
                id: row.setCategoryId,
                name: row.categoryName,
                type: row.categoryType,
              }
            : null,
        conditions: {
          accountId: row.matchAccountId,
          amountMax: normalizedAmount(row.matchAmountMax),
          amountMin: normalizedAmount(row.matchAmountMin),
          text:
            row.matchText !== null && row.matchTextOperator !== null
              ? { operator: row.matchTextOperator, value: row.matchText }
              : null,
          type: row.matchType,
        },
        createdAt: row.createdAt,
        enabled: row.enabled,
        id: row.id,
        name: row.name,
        position: row.position,
        tags,
        updatedAt: row.updatedAt,
      };
      return { ...rule, problem: ruleProblem(rule) };
    })
  );
};

/** Disabled rules and rules pointing at archived data never run. */
export const runnableRules = (rules: readonly StoredRule[]): StoredRule[] =>
  rules.filter((rule) => rule.enabled && rule.problem === null);
