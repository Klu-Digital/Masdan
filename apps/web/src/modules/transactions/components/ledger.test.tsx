import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

import { renderWithProviders, useWideViewport } from "@/test/render";

import type { Transaction } from "../queries";
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
    transactionDate: "2026-09-23",
    type: "income",
  }),
];

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("Ledger (wide)", () => {
  beforeEach(useWideViewport);

  it("groups rows under day headings and titles them by note, then category", async () => {
    renderWithProviders(
      <Ledger grouped onOpen={vi.fn()} today="2026-09-24" transactions={rows} />
    );
    expect(
      await screen.findByRole("columnheader", { name: "Today" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Yesterday" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Weekly market, Today/u })
    ).toBeInTheDocument();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
  });

  it("colours income as money in and reads signs aloud", async () => {
    renderWithProviders(
      <Ledger grouped onOpen={vi.fn()} today="2026-09-24" transactions={rows} />
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
  it("renders a touch list with the same rows", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(
      <Ledger grouped onOpen={onOpen} today="2026-09-24" transactions={rows} />
    );
    expect(
      await screen.findByRole("heading", { name: "Today" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salary/u }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t-3" }));
  });
});
