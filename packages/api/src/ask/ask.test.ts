import { describe, expect, it } from "vite-plus/test";

import { GOLDEN_CASES, GOLDEN_HOUSEHOLD, ai } from "./ask.golden";
import { askExtraction, askMessages, resolveAskPlan } from "./ask.plan";

describe("Ask Masdan golden set", () => {
  it.each(GOLDEN_CASES)("$name", ({ expected, extraction, question }) => {
    const plan = resolveAskPlan(question, GOLDEN_HOUSEHOLD, extraction);

    expect(plan.status).toBe(expected.status);
    if (expected.status === "ready" && plan.status === "ready") {
      expect(plan.query).toEqual(expected.query);
    }
    if (
      expected.status === "clarify" &&
      plan.status === "clarify" &&
      expected.options
    ) {
      expect(plan.options).toEqual(expected.options);
    }
  });

  it("covers every outcome, so a planner that always refuses cannot pass", () => {
    const statuses = GOLDEN_CASES.map((golden) => golden.expected.status);
    expect(statuses.filter((status) => status === "ready").length).toBe(14);
    expect(statuses.filter((status) => status === "clarify").length).toBe(7);
    expect(statuses.filter((status) => status === "unsupported").length).toBe(
      2
    );
  });
});

describe("resolveAskPlan", () => {
  const knownIds = new Set([
    ...GOLDEN_HOUSEHOLD.accounts.map((account) => account.id),
    ...GOLDEN_HOUSEHOLD.categories.map((category) => category.id),
  ]);

  it("only ever returns identifiers from the household it was given", () => {
    for (const golden of GOLDEN_CASES) {
      const plan = resolveAskPlan(
        golden.question,
        GOLDEN_HOUSEHOLD,
        golden.extraction
      );
      if (plan.status === "ready") {
        for (const value of [plan.query.accountId, plan.query.categoryId]) {
          expect(value === null || knownIds.has(value)).toBe(true);
        }
      }
    }
  });

  it("does not match another household's names", () => {
    const plan = resolveAskPlan(
      "how much did I spend on travel from my bdo card",
      GOLDEN_HOUSEHOLD,
      ai({ account: "bdo", category: "Travel", intent: "spending" })
    );

    expect(plan.status).toBe("clarify");
  });
});

describe("askExtraction", () => {
  it("rejects anything but the declared fields, so the model cannot pass scope", () => {
    const result = askExtraction.safeParse({
      ...ai({ intent: "spending" }),
      organizationId: "00000000-0000-4000-8000-000000000999",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an intent outside the fixed set", () => {
    const result = askExtraction.safeParse(ai({ intent: "sql" as "spending" }));

    expect(result.success).toBe(false);
  });
});

describe("askMessages", () => {
  it("hands the model names only — never identifiers", () => {
    const prompt = JSON.stringify(
      askMessages("what's my net worth", GOLDEN_HOUSEHOLD)
    );

    expect(prompt).toContain("Metrobank Titanium");
    expect(prompt).toContain("Food & Dining");
    for (const account of GOLDEN_HOUSEHOLD.accounts) {
      expect(prompt).not.toContain(account.id);
    }
    for (const category of GOLDEN_HOUSEHOLD.categories) {
      expect(prompt).not.toContain(category.id);
    }
  });
});
