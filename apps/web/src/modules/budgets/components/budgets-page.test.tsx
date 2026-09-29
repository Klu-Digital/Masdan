import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

import type { BudgetPermissions } from "./budgets-page";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const rpc = vi.hoisted(() => ({
  clear: vi.fn(),
  month: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      categoryBudgets: { clear: rpc.clear, month: rpc.month, set: rpc.set },
    }),
  };
});

const { BudgetsPage } = await import("./budgets-page");

const FOOD = "00000000-0000-4000-8000-000000000001";
const GROCERIES = "00000000-0000-4000-8000-000000000002";
const TRANSPORT = "00000000-0000-4000-8000-000000000003";
const PETS = "00000000-0000-4000-8000-000000000004";

const category = (id: string, name: string, icon: string) => ({
  archivedAt: null as Date | null,
  color: "orange",
  icon,
  id,
  name,
});

const food = {
  budget: {
    amount: "8000.000000",
    currencyCode: "PHP",
    id: "budget-food",
    updatedAt: new Date("2026-09-01"),
  },
  category: category(FOOD, "Food & Dining", "🍜"),
  count: 6,
  currencyCode: "PHP",
  otherCurrencies: [],
  overBy: "250.750000",
  percentUsed: 103,
  remaining: "0.000000",
  spent: "8250.750000",
  status: "overspent",
};

const groceries = {
  budget: {
    amount: "15000.000000",
    currencyCode: "PHP",
    id: "budget-groceries",
    updatedAt: new Date("2026-09-01"),
  },
  category: category(GROCERIES, "Groceries", "🛒"),
  count: 2,
  currencyCode: "PHP",
  otherCurrencies: [{ count: 1, currencyCode: "USD", total: "25.500000" }],
  overBy: "0.000000",
  percentUsed: 40,
  remaining: "9000.000000",
  spent: "6000.000000",
  status: "within",
};

const transport = {
  budget: null,
  category: category(TRANSPORT, "Transport", "🚕"),
  count: 1,
  currencyCode: "PHP",
  otherCurrencies: [],
  overBy: null,
  percentUsed: null,
  remaining: null,
  spent: "420.000000",
  status: "unbudgeted",
};

const pets = {
  ...food,
  budget: { ...food.budget, amount: "2000.000000", id: "budget-pets" },
  category: {
    ...category(PETS, "Pets", "🐶"),
    archivedAt: new Date("2026-08-01"),
  },
  overBy: "0.000000",
  percentUsed: 50,
  remaining: "1000.000000",
  spent: "1000.000000",
  status: "within",
};

const monthOf = (
  month: string,
  lines: unknown[],
  totals: Record<string, unknown> = {}
) => ({
  currentMonth: "2026-09",
  dateFrom: `${month}-01`,
  dateTo: month === "2026-09" ? "2026-09-24" : `${month}-28`,
  defaultCurrency: "PHP",
  lines,
  month,
  timezone: "Asia/Manila",
  today: "2026-09-24",
  totals: {
    budgeted: "23000.000000",
    budgetedCount: 2,
    currencyCode: "PHP",
    overBy: "0.000000",
    overspentCount: 1,
    remaining: "8749.250000",
    spent: "14250.750000",
    unbudgetedSpent: "420.000000",
    ...totals,
  },
});

const EVERYTHING: BudgetPermissions = { canClear: true, canUpdate: true };

const Harness = ({ permissions }: { permissions: BudgetPermissions }) => {
  const [month, setMonth] = useState<string>();
  return (
    <BudgetsPage
      activeOrganizationId="household-1"
      month={month}
      onMonthChange={(next) => setMonth(next)}
      permissions={permissions}
    />
  );
};

const renderPage = (permissions = EVERYTHING) =>
  renderWithProviders(
    <Harness permissions={permissions} />,
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.month.mockImplementation((input?: { month?: string }) =>
    Promise.resolve(
      monthOf(input?.month ?? "2026-09", [food, groceries, transport])
    )
  );
  rpc.set.mockResolvedValue({});
  rpc.clear.mockResolvedValue({});
});

describe("BudgetsPage", () => {
  it("shows remaining budget and flags overspending with the amount over", async () => {
    renderPage();
    const list = await screen.findByRole("list", {
      name: "Budgeted categories",
    });
    const [first, second] = within(list).getAllByRole("listitem");

    expect(first).toHaveTextContent("Food & Dining");
    expect(within(first as HTMLElement).getByText("Over budget")).toBeVisible();
    expect(first).toHaveTextContent("₱250.75over");
    expect(
      within(first as HTMLElement).getByRole("meter", {
        name: "Food & Dining budget used",
      })
    ).toHaveAttribute("aria-valuenow", "100");

    expect(second).toHaveTextContent("Groceries");
    expect(second).toHaveTextContent("₱6,000.00 of ₱15,000.00");
    expect(second).toHaveTextContent("₱9,000.00left");
    expect(
      within(second as HTMLElement).queryByText("Over budget")
    ).not.toBeInTheDocument();
    expect(second).toHaveTextContent(
      "Also $25.50 in other currencies, not counted"
    );

    expect(screen.getByLabelText("Month summary")).toHaveTextContent(
      "1 over budget"
    );
    expect(rpc.month).toHaveBeenCalledWith({});
  });

  it("lists categories without a budget and what they spent", async () => {
    renderPage();
    const list = await screen.findByRole("list", {
      name: "Categories without a budget",
    });
    expect(list).toHaveTextContent("Transport");
    expect(list).toHaveTextContent("₱420.00 spent");
  });

  it("sets a budget on an unbudgeted category for the shown month", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Set Transport budget" })
    );
    await user.type(await screen.findByLabelText("Monthly budget"), "6000");
    await user.click(screen.getByRole("button", { name: "Save budget" }));

    await waitFor(() =>
      expect(rpc.set).toHaveBeenCalledWith({
        amount: "6000",
        categoryId: TRANSPORT,
        month: "2026-09",
      })
    );
  });

  it("edits an existing budget and can remove it", async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("list", {
      name: "Budgeted categories",
    });
    await user.click(within(list).getByText("Groceries"));
    const amount = await screen.findByLabelText("Monthly budget");
    expect(amount).toHaveValue("15000");
    await user.clear(amount);
    await user.type(amount, "12500.5");
    await user.click(screen.getByRole("button", { name: "Save budget" }));
    await waitFor(() =>
      expect(rpc.set).toHaveBeenCalledWith({
        amount: "12500.5",
        categoryId: GROCERIES,
        month: "2026-09",
      })
    );

    await user.click(within(list).getByText("Groceries"));
    await user.click(
      await screen.findByRole("button", { name: "Remove budget" })
    );
    await waitFor(() =>
      expect(rpc.clear).toHaveBeenCalledWith({
        categoryId: GROCERIES,
        month: "2026-09",
      })
    );
  });

  it("rejects an empty amount before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Set Transport budget" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Save budget" })
    );

    expect(await screen.findByText("Use a positive amount")).toBeVisible();
    expect(rpc.set).not.toHaveBeenCalled();
  });

  it("moves between months and back to this one", async () => {
    const user = userEvent.setup();
    rpc.month.mockImplementation((input?: { month?: string }) =>
      Promise.resolve(
        input?.month === "2026-08"
          ? monthOf("2026-08", [pets, transport], {
              budgeted: "2000.000000",
              budgetedCount: 1,
              overspentCount: 0,
            })
          : monthOf("2026-09", [food, groceries, transport])
      )
    );
    renderPage();

    expect(await screen.findByText("September 2026")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(await screen.findByText("August 2026")).toBeVisible();
    expect(rpc.month).toHaveBeenLastCalledWith({ month: "2026-08" });
    const list = await screen.findByRole("list", {
      name: "Budgeted categories",
    });
    await waitFor(() => expect(list).toHaveTextContent("Pets"));
    // Archived categories keep their history, read-only.
    const [row] = within(list).getAllByRole("listitem");
    expect(within(row as HTMLElement).getByText("Archived")).toBeVisible();
    await user.click(within(list).getByText("Pets"));
    expect(screen.queryByLabelText("Monthly budget")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(await screen.findByText("September 2026")).toBeVisible();
    expect(rpc.month).toHaveBeenLastCalledWith({});
  });

  it("explains a month with no budgets", async () => {
    rpc.month.mockResolvedValue(
      monthOf("2026-09", [transport], {
        budgeted: "0.000000",
        budgetedCount: 0,
        overspentCount: 0,
      })
    );
    renderPage();

    expect(
      await screen.findByText("No budgets for September 2026")
    ).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Budgeted categories" })
    ).not.toBeInTheDocument();
  });

  it("shows an error state it can retry from", async () => {
    const user = userEvent.setup();
    rpc.month.mockRejectedValueOnce(new Error("offline"));
    renderPage();

    expect(await screen.findByText("Couldn’t load budgets")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("list", { name: "Budgeted categories" })
    ).toBeVisible();
  });

  it("hides editing from a viewer", async () => {
    const user = userEvent.setup();
    renderPage({ canClear: false, canUpdate: false });

    const list = await screen.findByRole("list", {
      name: "Budgeted categories",
    });
    expect(
      screen.queryByRole("button", { name: "Set Transport budget" })
    ).not.toBeInTheDocument();
    await user.click(within(list).getByText("Groceries"));
    expect(screen.queryByLabelText("Monthly budget")).not.toBeInTheDocument();
  });
});
