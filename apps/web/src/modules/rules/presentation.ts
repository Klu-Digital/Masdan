import { describeRuleConditions } from "@masdan/api/rules/engine";
import type { RuleConditions } from "@masdan/api/rules/engine";

/** Rule amounts apply to any account, so they read without a currency. */
export const formatRuleAmount = (amount: string): string =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 });

/** "Description contains “grab” · Money out", with account names resolved. */
export const ruleReasons = (
  conditions: RuleConditions,
  accounts: readonly { id: string; name: string }[] = []
): string[] =>
  describeRuleConditions(conditions, {
    account: (accountId) => accounts.find(({ id }) => id === accountId)?.name,
    formatAmount: formatRuleAmount,
  });

/** "Sets Transport · Adds Commute, Trip". */
export const ruleEffects = ({
  categoryName,
  tagNames,
}: {
  categoryName: string | null;
  tagNames: string[];
}): string[] => [
  ...(categoryName ? [`Sets ${categoryName}`] : []),
  ...(tagNames.length > 0 ? [`Adds ${tagNames.join(", ")}`] : []),
];
