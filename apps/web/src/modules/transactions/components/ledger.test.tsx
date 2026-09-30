import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { renderWithProviders, useWideViewport } from "@/test/render";

import type { Transaction } from "../types";
import { BulkActionBar } from "./bulk-action-bar";
import { Ledger } from "./ledger";

const entry = (overrides: Partial<Transaction>): Transaction =>
  ({
    accountClass: "asset",
    accountId: "account-1",
    accountName: "BPI Savings",
    amount: "125.500000",
    archivedAt: null,
    categoryColor: "green",
    categoryIcon: "🛒",
    categoryId: "category-1",
    categoryName: "Groceries",
    createdAt: new Date(),
    currencyCode: "PHP",
    id: "t-1",
    notes: null,
    organizationId: "household-1",
    paidStatus: "paid",
    splits: [],
    tags: [],
    transactionDate: "2026-09-24",
    transfer: null,
    transferId: null,
    transferSide: null,
    type: "expense",
    updatedAt: new Date(),
    ...overrides,
  }) as Transaction;

const rows = [
  entry({ id: "t-1", notes: "Weekly market" }),
  entry({
    categoryName: "Utilities",
    id: "t-2",
    paidStatus: "unpaid",
    transactionDate: "2026-09-23",
  }),
  entry({
    amount: "50000.000000",
    categoryName: "Salary",
    id: "t-3",
    transactionDate: "2026-08-23",
    type: "income",
  }),
];

const groups = [
  { items: rows.slice(0, 2), month: "2026-09" },
  { items: rows.slice(2), month: "2026-08" },
];

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const SelectableLedger = ({ onEdit }: { onEdit: () => void }) => {
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  return (
    <>
      <Ledger
        onOpen={vi.fn()}
        selection={{
          onToggle: (id) =>
            setSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            }),
          onToggleAll: vi.fn(),
          selectedIds,
        }}
        today="2026-09-24"
        transactions={rows}
      />
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onEdit={onEdit}
      />
    </>
  );
};

it("floats bulk actions when a row is selected and hides them when cleared", async () => {
  useWideViewport();
  const user = userEvent.setup();
  const onEdit = vi.fn();
  renderWithProviders(<SelectableLedger onEdit={onEdit} />);
  const checkbox = await screen.findByRole("checkbox", {
    name: /Select Weekly market/u,
  });
  expect(
    screen.queryByRole("toolbar", { name: "Bulk actions" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Edit…" })
  ).not.toBeInTheDocument();
  expect(document.querySelector('[role="toolbar"]')).toHaveAttribute("inert");
  await user.click(checkbox);
  const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
  expect(bar).toHaveClass("fixed", "bottom-32", "md:bottom-6");
  expect(bar.parentElement).toBe(document.body);
  expect(within(bar).getByText("1 selected")).toBeInTheDocument();
  await user.click(within(bar).getByRole("button", { name: "Edit…" }));
  expect(onEdit).toHaveBeenCalledOnce();
  await user.click(within(bar).getByRole("button", { name: "Clear" }));
  expect(
    screen.queryByRole("toolbar", { name: "Bulk actions" })
  ).not.toBeInTheDocument();
});

describe("Ledger (wide)", () => {
  beforeEach(useWideViewport);

  it("renders backend month groups with an exact date column", async () => {
    renderWithProviders(
      <Ledger
        groups={groups}
        onOpen={vi.fn()}
        today="2026-09-24"
        transactions={rows}
      />
    );
    expect(
      await screen.findByRole("columnheader", { name: "September 2026" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "August 2026" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Date" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Weekly market/u })
    ).toHaveTextContent("Sep 24");
    expect(
      screen.getByRole("row", { name: /Weekly market, Today/u })
    ).toBeInTheDocument();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("selects only editable rows without opening them", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const onToggleAll = vi.fn();
    renderWithProviders(
      <Ledger
        onOpen={onOpen}
        selection={{ onToggle, onToggleAll, selectedIds: new Set(["t-1"]) }}
        today="2026-09-24"
        transactions={[
          ...rows,
          entry({ archivedAt: new Date(), id: "archived" }),
          entry({ id: "transfer", transferId: "transfer-id" }),
        ]}
      />
    );
    expect(
      await screen.findByRole("checkbox", {
        name: "Select all loaded transactions",
      })
    ).toHaveAttribute("data-indeterminate");
    expect(
      screen.getByRole("checkbox", { name: /Select Weekly market/u })
    ).toBeChecked();
    expect(
      screen
        .getAllByRole("checkbox")
        .filter(
          (item) =>
            Object.hasOwn(item.dataset, "disabled") ||
            item.getAttribute("aria-disabled") === "true"
        )
    ).toHaveLength(2);
    await user.click(
      screen.getByRole("checkbox", { name: /Select Weekly market/u })
    );
    expect(onToggle).toHaveBeenCalledWith("t-1");
    expect(onOpen).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select all loaded transactions",
      })
    );
    expect(onToggleAll).toHaveBeenCalledWith(["t-1", "t-2", "t-3"]);
  });

  it("colours income as money in and reads signs aloud", async () => {
    renderWithProviders(
      <Ledger
        groups={groups}
        onOpen={vi.fn()}
        today="2026-09-24"
        transactions={rows}
      />
    );
    const salary = await screen.findByRole("row", { name: /Salary/u });
    expect(within(salary).getByText(/^plus /u)).toBeInTheDocument();
    const market = screen.getByRole("row", { name: /Weekly market/u });
    expect(within(market).getByText(/^minus /u)).toBeInTheDocument();
  });

  it("opens a row by click or keyboard and sorts from the headers", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSort = vi.fn();
    renderWithProviders(
      <Ledger
        onOpen={onOpen}
        sort={{ by: "date", direction: "desc", onSort }}
        today="2026-09-24"
        transactions={rows}
      />
    );
    await user.click(
      await screen.findByRole("row", { name: /Weekly market/u })
    );
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t-1" }));

    screen.getByRole("row", { name: /Utilities/u }).focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "t-2" })
    );

    await user.click(screen.getByRole("button", { name: /Amount/u }));
    expect(onSort).toHaveBeenCalledWith("amount");
  });
});

describe("Ledger (phone)", () => {
  it("selects from a separate hit target", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    renderWithProviders(
      <Ledger
        onOpen={onOpen}
        selection={{ onToggle, onToggleAll: vi.fn(), selectedIds: new Set() }}
        today="2026-09-24"
        transactions={rows}
      />
    );
    await user.click(
      await screen.findByRole("checkbox", { name: /Select Weekly market/u })
    );
    expect(onToggle).toHaveBeenCalledWith("t-1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("renders a touch list with the same rows", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(
      <Ledger
        groups={groups}
        onOpen={onOpen}
        today="2026-09-24"
        transactions={rows}
      />
    );
    expect(
      await screen.findByRole("heading", { name: "September 2026" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salary/u }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t-3" }));
  });
});
