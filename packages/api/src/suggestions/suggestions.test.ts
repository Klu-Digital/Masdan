import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_PROPOSAL,
  SUGGESTION_MAX_TAGS,
  minimizeSuggestionText,
  resolveSuggestions,
  suggestionExtraction,
  suggestionMessages,
} from "./suggestions.plan";
import type {
  SuggestionHousehold,
  SuggestionSubject,
} from "./suggestions.plan";

const HOUSEHOLD: SuggestionHousehold = {
  categories: [
    { id: "cat-food", name: "Food & Dining", type: "expense" },
    { id: "cat-transport", name: "Transport", type: "expense" },
    { id: "cat-salary", name: "Salary", type: "income" },
    { id: "cat-freelance", name: "Freelance", type: "income" },
  ],
  tags: [
    { id: "tag-work", name: "Work" },
    { id: "tag-trip", name: "Baguio Trip" },
    { id: "tag-kids", name: "Kids" },
    { id: "tag-gift", name: "Gift" },
  ],
};

const SUBJECTS: SuggestionSubject[] = [
  { key: "row-1", text: "JOLLIBEE MAKATI", type: "expense" },
  { key: "row-2", text: "GRAB RIDE", type: "expense" },
  { key: "row-3", text: "ACME PAYROLL", type: "income" },
];

const resolve = (items: unknown) =>
  resolveSuggestions(
    SUBJECTS,
    HOUSEHOLD,
    suggestionExtraction.parse({ items })
  );

describe("resolveSuggestions", () => {
  it("maps listed names to this household's ids", () => {
    const proposals = resolve([
      { category: "Food & Dining", ref: "1", tags: [] },
      { category: "transport", ref: "2", tags: ["work"] },
      { category: "Salary", ref: "3", tags: [] },
    ]);

    expect(proposals.get("row-1")).toEqual({
      categoryId: "cat-food",
      tagIds: [],
    });
    expect(proposals.get("row-2")).toEqual({
      categoryId: "cat-transport",
      tagIds: ["tag-work"],
    });
    expect(proposals.get("row-3")).toEqual({
      categoryId: "cat-salary",
      tagIds: [],
    });
  });

  it("drops categories and tags the household doesn't have", () => {
    const proposals = resolve([
      { category: "Restaurants", ref: "1", tags: ["Date night", "Kids"] },
    ]);

    expect(proposals.get("row-1")).toEqual({
      categoryId: null,
      tagIds: ["tag-kids"],
    });
  });

  it("never crosses directions: an income category can't label money out", () => {
    const proposals = resolve([
      { category: "Salary", ref: "1", tags: [] },
      { category: "Food & Dining", ref: "3", tags: [] },
    ]);

    expect(proposals.get("row-1")).toEqual(EMPTY_PROPOSAL);
    expect(proposals.get("row-3")).toEqual(EMPTY_PROPOSAL);
  });

  it("ignores unknown refs and keeps the first answer for a repeated one", () => {
    const proposals = resolve([
      { category: "Transport", ref: "9", tags: [] },
      { category: "Transport", ref: "01", tags: [] },
      { category: "Food & Dining", ref: "1", tags: [] },
      { category: "Transport", ref: "1", tags: [] },
    ]);

    expect(proposals.get("row-1")?.categoryId).toBe("cat-food");
    expect([...proposals.keys()]).toEqual(["row-1", "row-2", "row-3"]);
  });

  it("gives a skipped subject the empty proposal", () => {
    const proposals = resolve([]);

    for (const subject of SUBJECTS) {
      expect(proposals.get(subject.key)).toEqual(EMPTY_PROPOSAL);
    }
  });

  it("dedupes tags and caps how many are suggested", () => {
    const proposals = resolve([
      {
        category: null,
        ref: "2",
        tags: ["Work", "work", "Kids", "Gift", "Baguio Trip"],
      },
    ]);

    expect(proposals.get("row-2")?.tagIds).toEqual([
      "tag-work",
      "tag-kids",
      "tag-gift",
    ]);
    expect(proposals.get("row-2")?.tagIds).toHaveLength(SUGGESTION_MAX_TAGS);
  });
});

describe("suggestionExtraction", () => {
  it.each([
    ["extra keys", { items: [{ category: null, ref: "1", tags: [], x: 1 }] }],
    ["a missing field", { items: [{ ref: "1", tags: [] }] }],
    ["a non-array", { items: "Food" }],
    [
      "too many tags",
      {
        items: [
          { category: null, ref: "1", tags: ["a", "b", "c", "d", "e", "f"] },
        ],
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(suggestionExtraction.safeParse(value).success).toBe(false);
  });
});

describe("suggestionMessages", () => {
  it("sends names and masked text, never ids, amounts or accounts", () => {
    const [, user] = suggestionMessages(
      [
        {
          key: "019a0000-0000-7000-8000-000000000001",
          text: "BDO 5210123456789012 MERALCO REF 88812345",
          type: "expense",
        },
      ],
      HOUSEHOLD
    );
    const content = user?.content ?? "";

    expect(content).not.toContain("019a0000");
    expect(content).not.toContain("cat-");
    expect(content).not.toContain("tag-");
    expect(content).not.toContain("5210123456789012");
    expect(content).not.toContain("88812345");
    expect(JSON.parse(content).transactions).toEqual([
      { ref: "1", text: "BDO # MERALCO REF #", type: "expense" },
    ]);
  });
});

describe("minimizeSuggestionText", () => {
  it("collapses spacing and caps the length", () => {
    expect(minimizeSuggestionText("  GRAB   ride\n  ")).toBe("GRAB ride");
    expect(minimizeSuggestionText("x".repeat(500))).toHaveLength(200);
  });

  it("keeps short numbers that carry meaning", () => {
    expect(minimizeSuggestionText("7-Eleven 1234")).toBe("7-Eleven 1234");
  });
});
