import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  checkRuleConditions,
  findMatchingRule,
} from "@masdan/api/rules/engine";
import type { RuleSubject } from "@masdan/api/rules/engine";
import { positiveAmount } from "@masdan/api/shared/money";
import { Field, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useState } from "react";

import { ruleEffects, ruleReasons } from "../presentation";
import type { Rule } from "../types";

const TYPE_LABELS = { expense: "Money out", income: "Money in" } as const;

export const RuleTester = ({
  accounts,
  rules,
}: {
  accounts: { archivedAt: Date | null; id: string; name: string }[];
  rules: Rule[];
}) => {
  const activeAccounts = accounts.filter(
    ({ archivedAt }) => archivedAt === null
  );
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<RuleSubject["type"]>("expense");
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? "");

  const parsedAmount = positiveAmount.safeParse(amount);
  const subject: RuleSubject = {
    accountId,
    amount: parsedAmount.success ? parsedAmount.data : "0",
    description,
    type,
  };
  const runnable = rules.filter(
    (rule) => rule.enabled && rule.problem === null
  );
  const match =
    description.trim() || amount.trim()
      ? findMatchingRule(runnable, subject)
      : null;
  const reasons = match
    ? ruleReasons(match.rule.conditions, activeAccounts)
    : [];

  return (
    <section
      aria-labelledby="rule-tester-title"
      className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-4 dark:ring-1"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium" id="rule-tester-title">
          Try your rules
        </h2>
        <p className="text-muted-foreground text-xs">
          Describe a transaction to see which rule would run and why.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="rule-test-description">Description</FieldLabel>
          <Input
            id="rule-test-description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. GRAB*RIDE Makati"
            value={description}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rule-test-amount">Amount</FieldLabel>
          <Input
            id="rule-test-amount"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            value={amount}
          />
        </Field>
        <Field>
          <FieldLabel>Direction</FieldLabel>
          <Select
            onValueChange={(next) =>
              setType(next === "income" ? "income" : "expense")
            }
            value={type}
          >
            <SelectTrigger aria-label="Test direction">
              <SelectValue>{TYPE_LABELS[type]}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="expense">Money out</SelectItem>
              <SelectItem value="income">Money in</SelectItem>
            </SelectPopup>
          </Select>
        </Field>
        {activeAccounts.length > 1 ? (
          <Field className="sm:col-span-2">
            <FieldLabel>Account</FieldLabel>
            <Select
              onValueChange={(next) =>
                setAccountId(typeof next === "string" ? next : "")
              }
              value={accountId}
            >
              <SelectTrigger aria-label="Test account">
                <SelectValue>
                  {activeAccounts.find(({ id }) => id === accountId)?.name ??
                    "Choose"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {activeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 text-sm">
        {match ? (
          <>
            <p>
              <span className="text-muted-foreground">Matches </span>
              <span className="font-medium">{match.rule.name}</span>
            </p>
            <ul aria-label="Why it matched" className="flex flex-col gap-1">
              {checkRuleConditions(match.rule.conditions, subject).map(
                (check, index) => (
                  <li
                    className="flex items-center gap-2 text-xs"
                    key={check.field}
                  >
                    <HugeiconsIcon
                      className={
                        check.matched
                          ? "text-positive-foreground"
                          : "text-destructive-foreground"
                      }
                      icon={
                        check.matched ? CheckmarkCircle02Icon : Cancel01Icon
                      }
                      strokeWidth={2}
                    />
                    {reasons[index]}
                  </li>
                )
              )}
            </ul>
            <p className="text-muted-foreground text-xs">
              {ruleEffects({
                categoryName: match.rule.category?.name ?? null,
                tagNames: match.rule.tags.map(({ name }) => name),
              }).join(" · ")}
            </p>
          </>
        ) : null}
        {!match && (description.trim() || amount.trim()) ? (
          <p className="text-muted-foreground">
            No enabled rule matches. It would keep the category you choose.
          </p>
        ) : null}
      </div>
    </section>
  );
};
