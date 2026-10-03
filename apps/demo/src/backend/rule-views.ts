import { sortRules } from "@masdan/api/rules/engine";

import type { RouterOutputs } from "@/utils/orpc";

import { categoryOf } from "./ledger";
import { db } from "./store";
import type { Rule } from "./store";

type RuleView = RouterOutputs["rules"]["list"][number];

/** `ruleProblem` in packages/api/src/rules/rules.data.ts. */
const problemOf = (rule: Omit<RuleView, "problem">): string | null => {
  if (rule.category?.archivedAt) {
    return `Its category “${rule.category.name}” is archived`;
  }
  if (rule.category && rule.category.type !== rule.conditions.type) {
    return `“${rule.category.name}” is no longer a money ${rule.conditions.type === "income" ? "in" : "out"} category`;
  }
  const archivedTag = rule.tags.find((item) => item.archivedAt !== null);
  return archivedTag ? `Its tag “${archivedTag.name}” is archived` : null;
};

export const ruleView = (rule: Rule): RuleView => {
  const category = categoryOf(rule.actions.categoryId);
  const view = {
    ...rule,
    category: category && {
      archivedAt: category.archivedAt,
      color: category.color,
      icon: category.icon,
      id: category.id,
      name: category.name,
      type: category.type,
    },
    tags: db()
      .tags.filter((tag) => rule.actions.tagIds.includes(tag.id))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(({ archivedAt, color, id, name }) => ({
        archivedAt,
        color,
        id,
        name,
      })),
  };
  return { ...view, problem: problemOf(view) };
};

export const ruleViews = (): RuleView[] => sortRules(db().rules.map(ruleView));

/** Disabled rules and rules pointing at archived data never run. */
export const runnableRules = (): RuleView[] =>
  ruleViews().filter((rule) => rule.enabled && rule.problem === null);
