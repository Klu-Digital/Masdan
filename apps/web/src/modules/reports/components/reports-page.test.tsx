import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const netWorth = vi.hoisted(() => vi.fn());
const netWorthHistory = vi.hoisted(() => vi.fn());
const cashFlow = vi.hoisted(() => vi.fn());
const budgetPerformance = vi.hoisted(() => vi.fn());
const spendingByCategory = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      reports: {
        budgetPerformance,
        cashFlow,
        netWorth,
        netWorthHistory,
        spendingByCategory,
      },
    },
  };
});

const { ReportsPage } = await import("./reports-page");

const period = {
  dateFrom: "2026-04-01",
  dateTo: "2026-09-24",
  preset: "last_6_months",
  today: "2026-09-24",
};

const position = {
  accountCount: 2,
  assets: "15000.000000",
  currencyCode: "PHP",
  illiquidAssets: "0",
  liabilities: "2500.000000",
  liquidAssets: "15000.000000",
  liquidNetWorth: "12500.000000",
  netWorth: "12500.000000",
  semiLiquidAssets: "0",
  unclassifiedAssets: "0",
};

const emptyLedger = () => {
  netWorth.mockResolvedValue({
    byType: [],
    defaultCurrency: "PHP",
    positions: [],
    today: "2026-09-24",
  });
  netWorthHistory.mockResolvedValue({
    dateFrom: null,
    dateTo: null,
    defaultCurrency: "PHP",
    granularity: "month",
    period,
    points: [],
  });
  cashFlow.mockResolvedValue({
    defaultCurrency: "PHP",
    monthly: [],
    months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
    period,
    totals: [],
  });
  budgetPerformance.mockResolvedValue({
    defaultCurrency: "PHP",
    months: [],
    period,
    totals: [],
    truncated: false,
  });
  spendingByCategory.mockResolvedValue({
    categories: [],
    defaultCurrency: "PHP",
    period,
    totals: [],
  });
};

const renderPage = () =>
  renderWithProviders(
    <ReportsPage activeOrganizationId="household-1" currency="PHP" />
  );

beforeEach(() => {
  for (const mock of [
    netWorth,
    netWorthHistory,
    cashFlow,
    budgetPerformance,
    spendingByCategory,
  ]) {
    mock.mockReset();
  }
  emptyLedger();
});

describe("ReportsPage", () => {
  it("points a household with no ledger at its accounts", async () => {
    renderPage();
    expect(
      await screen.findByText("Nothing to report yet")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to accounts" })).toBeVisible();
  });

  it("shows per-section empty states when the period has no activity", async () => {
    netWorth.mockResolvedValue({
      byType: [],
      defaultCurrency: "PHP",
      positions: [position],
      today: "2026-09-24",
    });
    renderPage();

    expect(
      await screen.findByText("No income or expenses in this period.")
    ).toBeInTheDocument();
    expect(screen.getByText("No spending in this period.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to budgets" })).toBeVisible();
    expect(
      screen.getByText(/No balance history in this period/u)
    ).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Net worth" });
    expect(within(summary).getByText("Liquid net worth")).toBeInTheDocument();
  });

  it("renders totals and categories for the household currency", async () => {
    netWorth.mockResolvedValue({
      byType: [],
      defaultCurrency: "PHP",
      positions: [position],
      today: "2026-09-24",
    });
    cashFlow.mockResolvedValue({
      defaultCurrency: "PHP",
      monthly: [
        {
          currencyCode: "PHP",
          expense: "1200.000000",
          income: "5000.000000",
          month: "2026-09",
          net: "3800.000000",
          savingsRate: 76,
        },
      ],
      months: ["2026-09"],
      period,
      totals: [
        {
          currencyCode: "PHP",
          expense: "1200.000000",
          income: "5000.000000",
          net: "3800.000000",
          savingsRate: 76,
        },
      ],
    });
    spendingByCategory.mockResolvedValue({
      categories: [
        {
          categoryId: "groceries",
          color: "green",
          count: 2,
          currencyCode: "PHP",
          icon: "🛒",
          name: "Groceries",
          total: "1200.000000",
          type: "expense",
        },
      ],
      defaultCurrency: "PHP",
      period,
      totals: [{ currencyCode: "PHP", total: "1200.000000" }],
    });
    renderPage();

    expect(await screen.findByText("Net cash flow")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Monthly savings rates" })
      ).getByText("76%")
    ).toBeVisible();
    const flow = screen.getByRole("region", { name: "Cash flow" });
    expect(
      within(flow).getByRole("table", { name: "Money in and out by month" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Groceries share of spending" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Currency" })).toBeNull();
  });

  it("shows N/A for a month with no income and filters budget rows by currency", async () => {
    const user = userEvent.setup();
    netWorth.mockResolvedValue({
      byType: [],
      defaultCurrency: "PHP",
      positions: [position],
      today: "2026-09-24",
    });
    cashFlow.mockResolvedValue({
      defaultCurrency: "PHP",
      monthly: [
        {
          currencyCode: "PHP",
          expense: "20",
          income: "0",
          month: "2026-08",
          net: "-20",
          savingsRate: null,
        },
        {
          currencyCode: "PHP",
          expense: "25",
          income: "100",
          month: "2026-09",
          net: "75",
          savingsRate: 75,
        },
      ],
      months: ["2026-08", "2026-09"],
      period,
      totals: [
        {
          currencyCode: "PHP",
          expense: "45",
          income: "100",
          net: "55",
          savingsRate: 55,
        },
      ],
    });
    budgetPerformance.mockResolvedValue({
      defaultCurrency: "PHP",
      months: [
        {
          lines: [
            {
              archived: false,
              budgeted: "100",
              categoryId: "food",
              color: "green",
              currencyCode: "PHP",
              icon: "🍽️",
              name: "Food & Dining",
              percentUsed: 20,
              spent: "20",
              status: "within",
              variance: "80",
            },
            {
              archived: false,
              budgeted: "30",
              categoryId: "travel",
              color: "blue",
              currencyCode: "USD",
              icon: "✈️",
              name: "Travel",
              percentUsed: 133,
              spent: "40",
              status: "overspent",
              variance: "-10",
            },
          ],
          month: "2026-09",
          totals: [
            {
              budgeted: "100",
              currencyCode: "PHP",
              spent: "20",
              variance: "80",
            },
            {
              budgeted: "30",
              currencyCode: "USD",
              spent: "40",
              variance: "-10",
            },
          ],
        },
      ],
      period,
      totals: [
        { budgeted: "100", currencyCode: "PHP", spent: "20", variance: "80" },
        { budgeted: "30", currencyCode: "USD", spent: "40", variance: "-10" },
      ],
      truncated: false,
    });
    renderPage();
    const flow = await screen.findByRole("region", { name: "Cash flow" });
    expect(
      await within(flow).findByRole("table", {
        name: "Money in and out by month",
      })
    ).toHaveTextContent("N/A");
    const rates = screen.getByRole("list", { name: "Monthly savings rates" });
    expect(within(rates).getByText("N/A")).toBeVisible();
    expect(within(rates).getByText("75%")).toBeVisible();
    const budget = screen.getByRole("region", { name: "Budget performance" });
    expect(within(budget).getByText(/Food & Dining/u)).toBeInTheDocument();
    expect(within(budget).getByRole("table")).toHaveTextContent("100");
    expect(within(budget).getByRole("table")).toHaveTextContent("20");
    expect(within(budget).getByRole("table")).toHaveTextContent("80");
    expect(
      within(budget).getByRole("row", { name: /Total/u })
    ).toHaveTextContent("100");
    expect(
      within(budget).getByRole("row", { name: /Total/u })
    ).toHaveTextContent("20");
    expect(
      within(budget).getByRole("row", { name: /Total/u })
    ).toHaveTextContent("80");
    const periodTotals = within(budget).getByLabelText("Period budget totals");
    expect(periodTotals).toHaveTextContent("100");
    expect(periodTotals).toHaveTextContent("20");
    expect(periodTotals).toHaveTextContent("80");
    expect(within(budget).queryByText(/Travel/u)).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(await screen.findByRole("option", { name: "USD" }));
    expect(within(budget).getByText(/Travel/u)).toBeInTheDocument();
    expect(
      within(budget).getByRole("row", { name: /Total/u })
    ).toHaveTextContent("minus $10");
    expect(
      within(budget).getByLabelText("Period budget totals")
    ).toHaveTextContent("minus $10");
    expect(within(budget).queryByText(/Food & Dining/u)).toBeNull();
  });

  it("explains when budgets exist only in another currency", async () => {
    netWorth.mockResolvedValue({
      byType: [],
      defaultCurrency: "PHP",
      positions: [position],
      today: "2026-09-24",
    });
    budgetPerformance.mockResolvedValue({
      defaultCurrency: "PHP",
      months: [
        {
          lines: [
            {
              archived: false,
              budgeted: "30.000000",
              categoryId: "travel",
              color: "blue",
              currencyCode: "USD",
              icon: "✈️",
              name: "Travel",
              percentUsed: 50,
              spent: "15.000000",
              status: "within",
              variance: "15.000000",
            },
          ],
          month: "2026-09",
          totals: [
            {
              budgeted: "30.000000",
              currencyCode: "USD",
              spent: "15.000000",
              variance: "15.000000",
            },
          ],
        },
      ],
      period,
      totals: [
        {
          budgeted: "30.000000",
          currencyCode: "USD",
          spent: "15.000000",
          variance: "15.000000",
        },
      ],
      truncated: false,
    });
    renderPage();
    const budget = await screen.findByRole("region", {
      name: "Budget performance",
    });
    expect(
      await within(budget).findByText("No budgets in PHP for this period.")
    ).toBeInTheDocument();
    expect(within(budget).queryByRole("table")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(await screen.findByRole("option", { name: "USD" }));
    expect(within(budget).getByRole("table")).toHaveTextContent("Travel");
    expect(
      within(budget).queryByText("No budgets in PHP for this period.")
    ).toBeNull();
  });

  it("requests the chosen preset, and a custom range seeded from it", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(cashFlow).toHaveBeenCalledWith({ preset: "last_6_months" })
    );
    expect(netWorthHistory).toHaveBeenCalledWith({
      granularity: "month",
      preset: "last_6_months",
    });

    await user.click(screen.getByRole("combobox", { name: "Period" }));
    await user.click(await screen.findByRole("option", { name: "Last month" }));
    await waitFor(() =>
      expect(cashFlow).toHaveBeenLastCalledWith({ preset: "last_month" })
    );
    expect(netWorthHistory).toHaveBeenLastCalledWith({
      granularity: "week",
      preset: "last_month",
    });
    expect(screen.queryByRole("button", { name: "From" })).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Period" }));
    await user.click(
      await screen.findByRole("option", { name: "Custom range" })
    );
    await waitFor(() =>
      expect(spendingByCategory).toHaveBeenLastCalledWith({
        dateFrom: "2026-04-01",
        dateTo: "2026-09-24",
        preset: "custom",
      })
    );
    expect(screen.getByRole("button", { name: "From" })).toBeVisible();
    expect(screen.getByRole("button", { name: "To" })).toBeVisible();
  });
});
