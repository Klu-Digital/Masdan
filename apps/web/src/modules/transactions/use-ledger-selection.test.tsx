import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_TRANSACTION_SEARCH } from "./search";
import { useLedgerSelection } from "./use-ledger-selection";

describe("useLedgerSelection", () => {
  it("toggles a row, selects all on the page, then clears all", () => {
    const { result } = renderHook(() =>
      useLedgerSelection(DEFAULT_TRANSACTION_SEARCH)
    );
    act(() => result.current.toggleSelection("first"));
    expect([...result.current.selectedIds]).toEqual(["first"]);
    act(() => result.current.toggleSelection("first"));
    expect(result.current.selectedIds.size).toBe(0);
    act(() => result.current.toggleSelection("first"));
    act(() => result.current.toggleAll(["first", "second"]));
    expect([...result.current.selectedIds]).toEqual(["first", "second"]);
    act(() => result.current.toggleAll(["first", "second"]));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("resets on page or filter change and does not restore old selections", () => {
    let search = DEFAULT_TRANSACTION_SEARCH;
    const { result, rerender } = renderHook(() => useLedgerSelection(search));
    act(() => result.current.toggleSelection("first"));
    search = { ...search, page: 2 };
    rerender();
    expect(result.current.selectedIds.size).toBe(0);
    act(() => result.current.toggleSelection("second"));
    search = { ...search, search: "food" };
    rerender();
    expect(result.current.selectedIds.size).toBe(0);
    search = DEFAULT_TRANSACTION_SEARCH;
    rerender();
    expect(result.current.selectedIds.size).toBe(0);
    act(() => result.current.toggleSelection("third"));
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });
});
