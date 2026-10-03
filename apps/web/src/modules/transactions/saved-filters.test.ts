import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  isDefaultSearch,
  loadSavedFilters,
  saveFilters,
} from "./saved-filters";
import { transactionSearch } from "./search";
import type { TransactionSearch } from "./search";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
});

const search = (input: Record<string, unknown>) =>
  transactionSearch.parse(input) as TransactionSearch;

describe("saved filters", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips filters and leaves out search text", () => {
    saveFilters(
      "home",
      search({
        accountIds: ["a1"],
        dateFrom: "2026-01-01",
        search: "coffee",
        sortBy: "amount",
        types: ["expense"],
      })
    );

    const saved = loadSavedFilters("home");
    expect(saved).toMatchObject({
      accountIds: ["a1"],
      dateFrom: "2026-01-01",
      sortBy: "amount",
      types: ["expense"],
    });
    expect(saved).not.toHaveProperty("search");
  });

  it("saves a date preset by name, so it resolves against the day of return", () => {
    saveFilters("home", search({ datePreset: "this-month" }));

    const saved = loadSavedFilters("home");
    expect(saved?.datePreset).toBe("this-month");
    expect(saved?.dateFrom).toBeUndefined();
  });

  it("keeps households apart", () => {
    saveFilters("home", search({ tagIds: ["t1"] }));
    expect(loadSavedFilters("other")).toBeNull();
  });

  it("returns null for defaults, so a cleared ledger is not restored", () => {
    saveFilters("home", search({ tagIds: ["t1"] }));
    saveFilters("home", search({}));
    expect(loadSavedFilters("home")).toBeNull();
  });

  it("returns null for corrupt storage", () => {
    window.localStorage.setItem("masdan.transactions.filters.home", "{nope");
    expect(loadSavedFilters("home")).toBeNull();
  });

  it("tells a bare visit from a filtered one", () => {
    expect(isDefaultSearch(search({}))).toBe(true);
    expect(isDefaultSearch(search({ tagIds: ["t1"] }))).toBe(false);
    expect(isDefaultSearch(search({ search: "coffee" }))).toBe(false);
    expect(isDefaultSearch(search({ sortBy: "amount" }))).toBe(false);
  });
});
