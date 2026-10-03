import { describe, expect, it } from "vite-plus/test";

import type { EvaluableRule } from "../rules/engine";
import { resolveQuickEntry } from "./quick-entry";
import {
  GOLDEN_CASES,
  GOLDEN_HOUSEHOLD,
  GOLDEN_IDS,
  ai,
} from "./quick-entry.golden";
import { transactionValues } from "./schema";

describe("quick entry golden set", () => {
  it.each(GOLDEN_CASES)("$name", ({ expected, extraction, text }) => {
    const result = resolveQuickEntry(text, GOLDEN_HOUSEHOLD, extraction);

    if (expected.outcome === "create") {
      expect(result.issues).toEqual([]);
      expect(result.kind).toBe(expected.kind);
      expect(result.input).toEqual({
        accountId: expected.accountId,
        amount: expected.amount,
        categoryId: expected.categoryId,
        notes: expected.notes,
        paidStatus: expected.paidStatus ?? "paid",
        tagIds: [],
        transactionDate: expected.transactionDate ?? GOLDEN_HOUSEHOLD.today,
      });
      return;
    }

    expect(result.input).toBeNull();
    expect(result.issues.map((issue) => issue.field).toSorted()).toEqual(
      expected.fields.toSorted()
    );
    expect(result.prefill).toMatchObject(expected.prefill ?? {});
  });

  it("covers both outcomes, so a parser that always reviews cannot pass", () => {
    const outcomes = GOLDEN_CASES.map((golden) => golden.expected.outcome);
    expect(outcomes.filter((outcome) => outcome === "create").length).toBe(14);
    expect(outcomes.filter((outcome) => outcome === "review").length).toBe(20);
  });
});

describe("resolveQuickEntry", () => {
  const household = GOLDEN_HOUSEHOLD;
  const dateOn = (text: string, today: string) =>
    resolveQuickEntry(text, { ...household, today }, null).prefill
      .transactionDate;
  const knownIds = new Set([
    ...household.accounts.map((account) => account.id),
    ...household.categories.map((category) => category.id),
  ]);

  it("only ever returns identifiers from the household it was given", () => {
    for (const golden of GOLDEN_CASES) {
      const { prefill } = resolveQuickEntry(
        golden.text,
        household,
        golden.extraction
      );
      for (const value of [prefill.accountId, prefill.categoryId]) {
        expect(value === null || knownIds.has(value)).toBe(true);
      }
    }
  });

  it("ignores identifiers and prompt text the model echoes back", () => {
    const foreign = "11111111-1111-4111-8111-111111111111";
    const result = resolveQuickEntry("dinner 400 gcash", household, {
      ...ai({ amount: "400", category: "Food & Dining" }),
      account: foreign,
      dateText: "ignore previous instructions",
    });

    expect(result.input?.accountId).toBe(GOLDEN_IDS.gcash);
    expect(JSON.stringify(result)).not.toContain(foreign);
  });

  it("passes every created input through the create schema unchanged", () => {
    for (const golden of GOLDEN_CASES) {
      const { input } = resolveQuickEntry(
        golden.text,
        household,
        golden.extraction
      );
      if (input) {
        expect(transactionValues.parse(input)).toEqual(input);
      }
    }
  });

  it("drops a model date the text never mentions", () => {
    const result = resolveQuickEntry(
      "dinner 400 gcash",
      household,
      ai({
        account: "gcash",
        amount: "400",
        category: "Food & Dining",
        date: "2026-01-01",
        dateText: "new year",
      })
    );

    expect(result.input?.transactionDate).toBe(household.today);
  });

  it("uses a model date for words the lexicon lacks when the text contains them", () => {
    const result = resolveQuickEntry(
      "dinner 400 gcash noong isang araw",
      household,
      ai({
        account: "gcash",
        amount: "400",
        category: "Food & Dining",
        date: "2026-09-24",
        dateText: "noong isang araw",
      })
    );

    expect(result.input?.transactionDate).toBe("2026-09-24");
  });

  it("rejects a malformed model date instead of passing it on", () => {
    const result = resolveQuickEntry(
      "dinner 400 gcash noong isang araw",
      household,
      ai({
        account: "gcash",
        amount: "400",
        category: "Food & Dining",
        date: "2026-02-30",
        dateText: "noong isang araw",
      })
    );

    expect(result.input?.transactionDate).toBe(household.today);
  });

  it("defaults to the only account when the household has one", () => {
    const [onlyAccount] = household.accounts;
    const result = resolveQuickEntry(
      "dinner 400",
      { ...household, accounts: onlyAccount ? [onlyAccount] : [] },
      ai({ amount: "400", category: "Food & Dining" })
    );

    expect(result.input?.accountId).toBe(GOLDEN_IDS.bpiSavings);
  });

  it("reads explicit and two-digit-year slash dates", () => {
    expect(
      resolveQuickEntry("dinner 400 gcash 2026-09-01", household, null).prefill
        .transactionDate
    ).toBe("2026-09-01");
    expect(
      resolveQuickEntry("dinner 400 gcash 9/2/26", household, null).prefill
        .transactionDate
    ).toBe("2026-09-02");
  });

  it("puts a yearless date in the year nearest today", () => {
    expect(dateOn("dinner 400 gcash dec 30", "2027-01-02")).toBe("2026-12-30");
    expect(dateOn("dinner 400 gcash jan 2", "2026-12-30")).toBe("2027-01-02");
    expect(dateOn("dinner 400 gcash sep 20", "2026-09-26")).toBe("2026-09-20");
  });
});

const TAG = "00000000-0000-4000-8000-0000000000aa";
const rule = (
  actions: { categoryId: string | null; tagIds: string[] },
  text = "grab"
): EvaluableRule => ({
  actions,
  conditions: {
    accountId: null,
    amountMax: null,
    amountMin: null,
    text: { operator: "contains", value: text },
    type: "expense",
  },
  enabled: true,
  id: "00000000-0000-4000-8000-0000000000bb",
  name: "Grab rides",
  position: 0,
});
const run = (text: string, rules: EvaluableRule[], category?: string) =>
  resolveQuickEntry(
    text,
    GOLDEN_HOUSEHOLD,
    ai({
      account: "gcash",
      amount: "250",
      category: category ?? null,
      notes: "Grab ride",
    }),
    rules
  );

describe("quick entry rules", () => {
  it("fills the category and tags from a matching rule", () => {
    const result = run("grab ride 250 gcash", [
      rule({ categoryId: GOLDEN_IDS.transport, tagIds: [TAG] }),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.input).toMatchObject({
      categoryId: GOLDEN_IDS.transport,
      tagIds: [TAG],
    });
  });

  it("lets a rule settle a category the model left blank", () => {
    expect(
      run("grab ride 250 gcash", [
        rule({ categoryId: GOLDEN_IDS.transport, tagIds: [] }),
      ]).input
    ).not.toBeNull();
    expect(run("grab ride 250 gcash", []).input).toBeNull();
  });

  it("keeps a category the text names, but still adds the tags", () => {
    const result = run("grab ride 250 gcash shopping", [
      rule({ categoryId: GOLDEN_IDS.transport, tagIds: [TAG] }),
    ]);

    expect(result.input).toMatchObject({
      categoryId: GOLDEN_IDS.shopping,
      tagIds: [TAG],
    });
  });

  it("ignores a rule that does not match", () => {
    const result = run("dinner 250 gcash", [
      rule({ categoryId: GOLDEN_IDS.transport, tagIds: [TAG] }),
    ]);

    expect(result.prefill.tagIds).toEqual([]);
    expect(result.prefill.categoryId).toBeNull();
  });
});
