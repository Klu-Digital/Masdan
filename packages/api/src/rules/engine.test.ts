import { describe, expect, it } from "vite-plus/test";

import {
  applyRuleActions,
  checkRuleConditions,
  describeRuleConditions,
  findMatchingRule,
  ruleApplicationHolds,
  ruleMatches,
  sortRules,
} from "./engine";
import type { EvaluableRule, RuleConditions, RuleSubject } from "./engine";

const NO_CONDITIONS: RuleConditions = {
  accountId: null,
  amountMax: null,
  amountMin: null,
  text: null,
  type: null,
};

const rule = (
  overrides: Partial<Omit<EvaluableRule, "conditions">> & {
    conditions?: Partial<RuleConditions>;
  } = {}
): EvaluableRule => ({
  actions: overrides.actions ?? { categoryId: "transport", tagIds: [] },
  conditions: { ...NO_CONDITIONS, ...overrides.conditions },
  enabled: overrides.enabled ?? true,
  id: overrides.id ?? "rule-1",
  name: overrides.name ?? "Rides",
  position: overrides.position ?? 0,
});

const subject = (overrides: Partial<RuleSubject> = {}): RuleSubject => ({
  accountId: "bpi",
  amount: "250",
  description: "GRAB*Ride  Makati",
  type: "expense",
  ...overrides,
});

describe("checkRuleConditions", () => {
  it("matches description text case- and whitespace-insensitively", () => {
    const text = (
      operator: "contains" | "equals" | "startsWith",
      value: string
    ) =>
      checkRuleConditions(
        { ...NO_CONDITIONS, text: { operator, value } },
        subject()
      );

    expect(text("contains", "ride makati")).toEqual([
      { field: "description", matched: true },
    ]);
    expect(text("startsWith", "grab*")).toEqual([
      { field: "description", matched: true },
    ]);
    expect(text("startsWith", "ride")).toEqual([
      { field: "description", matched: false },
    ]);
    expect(text("equals", "grab*ride makati")).toEqual([
      { field: "description", matched: true },
    ]);
    expect(text("equals", "grab")).toEqual([
      { field: "description", matched: false },
    ]);
  });

  it("treats a missing description as empty text", () => {
    expect(
      checkRuleConditions(
        { ...NO_CONDITIONS, text: { operator: "contains", value: "grab" } },
        subject({ description: null })
      )
    ).toEqual([{ field: "description", matched: false }]);
  });

  it("checks type, account and an inclusive amount range", () => {
    const conditions: RuleConditions = {
      accountId: "bpi",
      amountMax: "250",
      amountMin: "100.5",
      text: null,
      type: "expense",
    };
    expect(checkRuleConditions(conditions, subject())).toEqual([
      { field: "type", matched: true },
      { field: "account", matched: true },
      { field: "amount", matched: true },
    ]);
    expect(
      checkRuleConditions(
        conditions,
        subject({ accountId: "gcash", amount: "250.000001", type: "income" })
      )
    ).toEqual([
      { field: "type", matched: false },
      { field: "account", matched: false },
      { field: "amount", matched: false },
    ]);
    expect(
      checkRuleConditions(conditions, subject({ amount: "100.5" }))
    ).toContainEqual({ field: "amount", matched: true });
  });

  it("supports one-sided amount bounds", () => {
    expect(
      checkRuleConditions({ ...NO_CONDITIONS, amountMin: "1000" }, subject())
    ).toEqual([{ field: "amount", matched: false }]);
    expect(
      checkRuleConditions({ ...NO_CONDITIONS, amountMax: "1000" }, subject())
    ).toEqual([{ field: "amount", matched: true }]);
  });
});

describe("ruleMatches", () => {
  it("requires every configured condition", () => {
    const grab = rule({
      conditions: {
        text: { operator: "contains", value: "grab" },
        type: "expense",
      },
    });
    expect(ruleMatches(grab, subject())).toBe(true);
    expect(ruleMatches(grab, subject({ type: "income" }))).toBe(false);
  });

  it("never matches a rule without conditions", () => {
    expect(ruleMatches(rule(), subject())).toBe(false);
  });

  it("never matches a disabled rule, even when every condition holds", () => {
    const disabled = rule({
      conditions: { text: { operator: "contains", value: "grab" } },
      enabled: false,
    });
    expect(ruleMatches(disabled, subject())).toBe(false);
    expect(findMatchingRule([disabled], subject())).toBeNull();
  });
});

describe("precedence", () => {
  const broad = rule({
    conditions: { type: "expense" },
    id: "b-broad",
    name: "Any expense",
    position: 1,
  });
  const specific = rule({
    conditions: { text: { operator: "contains", value: "grab" } },
    id: "a-specific",
    name: "Grab",
    position: 0,
  });

  it("applies the first matching rule by position, whatever the input order", () => {
    expect(findMatchingRule([broad, specific], subject())?.rule.name).toBe(
      "Grab"
    );
    expect(findMatchingRule([specific, broad], subject())?.rule.name).toBe(
      "Grab"
    );
  });

  it("falls through to the next rule when an earlier one doesn't match", () => {
    expect(
      findMatchingRule([broad, specific], subject({ description: "Jollibee" }))
        ?.rule.name
    ).toBe("Any expense");
  });

  it("skips a disabled earlier rule instead of stopping at it", () => {
    const disabledFirst = { ...specific, enabled: false };
    expect(findMatchingRule([disabledFirst, broad], subject())?.rule.name).toBe(
      "Any expense"
    );
  });

  it("breaks position ties by id so the order is stable", () => {
    const later = { ...broad, id: "z", position: 0 };
    const earlier = { ...broad, id: "a", position: 0 };
    expect(sortRules([later, earlier]).map(({ id }) => id)).toEqual(["a", "z"]);
    expect(sortRules([earlier, later]).map(({ id }) => id)).toEqual(["a", "z"]);
  });

  it("reports why the winning rule matched", () => {
    expect(findMatchingRule([broad, specific], subject())?.checks).toEqual([
      { field: "description", matched: true },
    ]);
  });
});

describe("applyRuleActions", () => {
  it("changes only the category when the rule sets only a category", () => {
    const outcome = applyRuleActions(
      rule({ actions: { categoryId: "transport", tagIds: [] } }),
      { categoryId: "groceries", tagIds: ["trip"] }
    );
    expect(outcome.categoryId).toBe("transport");
    expect(outcome.tagIds).toEqual(["trip"]);
    expect(outcome.addedTagIds).toEqual([]);
  });

  it("adds tags without touching the category or removing existing tags", () => {
    const outcome = applyRuleActions(
      rule({ actions: { categoryId: null, tagIds: ["commute", "trip"] } }),
      { categoryId: "groceries", tagIds: ["trip"] }
    );
    expect(outcome.categoryId).toBe("groceries");
    expect(outcome.tagIds).toEqual(["trip", "commute"]);
    expect(outcome.addedTagIds).toEqual(["commute"]);
  });

  it("records the rule and its conditions as provenance", () => {
    const grab = rule({
      conditions: { text: { operator: "contains", value: "grab" } },
    });
    expect(
      applyRuleActions(grab, { categoryId: "groceries", tagIds: [] })
        .application
    ).toEqual({
      categoryId: "transport",
      conditions: grab.conditions,
      ruleId: "rule-1",
      ruleName: "Rides",
      tagIds: [],
    });
  });
});

describe("ruleApplicationHolds", () => {
  const application = {
    categoryId: "transport",
    conditions: NO_CONDITIONS,
    ruleId: "rule-1",
    ruleName: "Rides",
    tagIds: ["commute"],
  };

  it("holds while the rule's category and tags are still there", () => {
    expect(
      ruleApplicationHolds(application, {
        categoryId: "transport",
        tagIds: ["commute", "trip"],
      })
    ).toBe(true);
  });

  it("stops holding once a manual edit replaces what the rule set", () => {
    expect(
      ruleApplicationHolds(application, {
        categoryId: "groceries",
        tagIds: ["commute"],
      })
    ).toBe(false);
    expect(
      ruleApplicationHolds(application, {
        categoryId: "transport",
        tagIds: [],
      })
    ).toBe(false);
  });
});

describe("describeRuleConditions", () => {
  it("explains each condition in plain language", () => {
    expect(
      describeRuleConditions(
        {
          accountId: "bpi",
          amountMax: "500",
          amountMin: "100",
          text: { operator: "startsWith", value: "GRAB" },
          type: "expense",
        },
        {
          account: (id) => (id === "bpi" ? "BPI Savings" : undefined),
          formatAmount: (amount) => `₱${amount}`,
        }
      )
    ).toEqual([
      "Description starts with “GRAB”",
      "Money out",
      "Account is BPI Savings",
      "Amount between ₱100 and ₱500",
    ]);
    expect(
      describeRuleConditions({
        ...NO_CONDITIONS,
        amountMax: "10.50",
        amountMin: "10.5",
      })
    ).toEqual(["Amount is 10.5"]);
  });
});
