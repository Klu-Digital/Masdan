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
const spendingByCategory = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      reports: { cashFlow, netWorth, netWorthHistory, spendingByCategory },
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
    const flow = screen.getByRole("region", { name: "Cash flow" });
    expect(
      within(flow).getByRole("table", { name: "Money in and out by month" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Groceries share of spending" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Currency" })).toBeNull();
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
