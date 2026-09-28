import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

import type { OverviewHousehold } from "./overview-page";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const accountsList = vi.hoisted(() => vi.fn());
const listStatements = vi.hoisted(() => vi.fn());
const listForCurrentUser = vi.hoisted(() => vi.fn());
const netWorth = vi.hoisted(() => vi.fn());
const netWorthHistory = vi.hoisted(() => vi.fn());
const cashFlow = vi.hoisted(() => vi.fn());
const spendingByCategory = vi.hoisted(() => vi.fn());
const transactionsList = vi.hoisted(() => vi.fn());
const actions = vi.hoisted(() => ({
  compose: vi.fn(),
  composeAccount: vi.fn(),
  inspect: vi.fn(),
  openCommandMenu: vi.fn(),
}));

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList, listStatements },
      invitations: { listForCurrentUser },
      reports: { cashFlow, netWorth, netWorthHistory, spendingByCategory },
      transactions: { list: transactionsList },
    },
  };
});
vi.mock("@/components/app-actions", () => ({ useAppActions: () => actions }));

const { OverviewPage } = await import("./overview-page");

const household = (id: string, name: string): OverviewHousehold => ({
  activeOrganizationId: id,
  can: () => true,
  currency: "PHP",
  organization: { name },
  session: { user: { name: "Kevin Mallari" } },
  timezone: "Asia/Manila",
});

const HOUSEHOLD_A = household("household-a", "Mallari Home");
const HOUSEHOLD_B = household("household-b", "Beach House");

const monthPeriod = {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-24",
  preset: "this_month",
  today: "2026-09-24",
};
const trendPeriod = { ...monthPeriod, preset: "last_6_months" };

const position = (
  currencyCode: string,
  netWorthValue: string,
  liabilities = "0"
) => ({
  accountCount: 1,
  assets: String(Number(netWorthValue) + Number(liabilities)),
  currencyCode,
  illiquidAssets: "0",
  liabilities,
  liquidAssets: netWorthValue,
  liquidNetWorth: netWorthValue,
  netWorth: netWorthValue,
  semiLiquidAssets: "0",
  unclassifiedAssets: "0",
});

const account = (id: string, name: string, accountType: string) => ({
  accountClass: "asset",
  accountType,
  archivedAt: null,
  balance: "1000.000000",
  color: null,
  currencyCode: "PHP",
  id,
  includeInNetWorth: true,
  name,
  paymentDueDay: null,
});

const entry = (id: string, notes: string) => ({
  accountClass: "asset",
  accountId: "account-1",
  accountName: "BPI Savings",
  amount: "125.500000",
  archivedAt: null,
  categoryColor: "green",
  categoryIcon: "🛒",
  categoryId: "groceries",
  categoryName: "Groceries",
  createdAt: new Date(),
  currencyCode: "PHP",
  id,
  notes,
  organizationId: "household-a",
  paidStatus: "paid",
  splits: [],
  tags: [],
  transactionDate: "2026-09-24",
  transfer: null,
  transferId: null,
  transferSide: null,
  type: "expense",
  updatedAt: new Date(),
});

const page = (items: unknown[]) => ({
  items,
  total: items.length,
  totalPages: 1,
});

interface Ledger {
  accounts: unknown[];
  netWorth: string;
  recent: unknown[];
}

/** What the server answers for each household's session. */
const LEDGERS: Record<string, Ledger> = {
  "household-a": {
    accounts: [account("account-1", "BPI Savings", "bank")],
    netWorth: "12500.000000",
    recent: [entry("t-1", "Weekly market"), entry("t-2", "Rice and eggs")],
  },
  "household-b": {
    accounts: [account("account-9", "GCash", "e_wallet")],
    netWorth: "900.000000",
    recent: [entry("t-9", "Beach snacks")],
  },
};

const server = vi.hoisted(() => ({ active: "household-a" }));

const serveLedger = () => {
  accountsList.mockImplementation(() =>
    Promise.resolve(LEDGERS[server.active]?.accounts ?? [])
  );
  netWorth.mockImplementation(() =>
    Promise.resolve({
      byType: [],
      defaultCurrency: "PHP",
      positions: [
        position("PHP", LEDGERS[server.active]?.netWorth ?? "0", "2500"),
        position("USD", "300.000000"),
      ],
      today: "2026-09-24",
    })
  );
  netWorthHistory.mockResolvedValue({
    dateFrom: "2026-04-30",
    dateTo: "2026-09-24",
    defaultCurrency: "PHP",
    granularity: "month",
    period: trendPeriod,
    points: [
      {
        date: "2026-09-24",
        positions: [
          {
            assets: "12500.000000",
            currencyCode: "PHP",
            liabilities: "0",
            liquidAssets: "12500.000000",
            netWorth: "12500.000000",
          },
        ],
      },
    ],
  });
  cashFlow.mockResolvedValue({
    defaultCurrency: "PHP",
    monthly: [],
    months: ["2026-09"],
    period: monthPeriod,
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
    period: monthPeriod,
    totals: [{ currencyCode: "PHP", total: "1200.000000" }],
  });
  transactionsList.mockImplementation((input: { paidStatuses: string[] }) => {
    if (input.paidStatuses.includes("unpaid")) {
      return Promise.resolve(page([]));
    }
    return Promise.resolve(page(LEDGERS[server.active]?.recent ?? []));
  });
};

const serveEmptyHousehold = () => {
  accountsList.mockResolvedValue([]);
  netWorth.mockResolvedValue({
    byType: [],
    defaultCurrency: "PHP",
    positions: [],
    today: "2026-09-24",
  });
  cashFlow.mockResolvedValue({
    defaultCurrency: "PHP",
    monthly: [],
    months: ["2026-09"],
    period: monthPeriod,
    totals: [],
  });
  spendingByCategory.mockResolvedValue({
    categories: [],
    defaultCurrency: "PHP",
    period: monthPeriod,
    totals: [],
  });
  transactionsList.mockResolvedValue(page([]));
};

/** A request that never answers, so its section stays loading. */
const never = () => Promise.withResolvers<never>().promise;

const worthOf = () => screen.getByRole("region", { name: "Net worth" });
const monthOf = () => screen.getByRole("region", { name: "This month" });

beforeEach(() => {
  server.active = "household-a";
  for (const mock of [
    accountsList,
    listStatements,
    listForCurrentUser,
    netWorth,
    netWorthHistory,
    cashFlow,
    spendingByCategory,
    transactionsList,
    ...Object.values(actions),
  ]) {
    mock.mockReset();
  }
  listForCurrentUser.mockResolvedValue([]);
  listStatements.mockResolvedValue([]);
  serveLedger();
});

describe("OverviewPage", () => {
  it("summarises the household from the report endpoints", async () => {
    renderWithProviders(<OverviewPage household={HOUSEHOLD_A} />);

    const worth = await screen.findByRole("region", { name: "Net worth" });
    expect(await within(worth).findByText("₱12,500.00")).toBeInTheDocument();
    expect(within(worth).getByText("₱15,000.00")).toBeInTheDocument();
    expect(within(worth).getByText("₱2,500.00")).toBeInTheDocument();
    expect(within(worth).getByText(/Plus/u)).toHaveTextContent("Plus $300.00");
    expect(
      within(worth).getByRole("link", { name: "Accounts" })
    ).toHaveAttribute("href", "/accounts");

    const month = screen.getByRole("region", { name: "This month" });
    expect(
      await within(month).findByText("September 2026 so far")
    ).toBeInTheDocument();
    expect(within(month).getByText("plus ₱5,000.00")).toBeInTheDocument();
    expect(within(month).getByText("minus ₱1,200.00")).toBeInTheDocument();
    expect(within(month).getByText("Left over")).toBeInTheDocument();
    expect(
      within(month).getByRole("link", { name: "Reports" })
    ).toHaveAttribute("href", "/reports");

    expect(cashFlow).toHaveBeenCalledWith({ preset: "this_month" });
    expect(spendingByCategory).toHaveBeenCalledWith({ preset: "this_month" });
    expect(netWorthHistory).toHaveBeenCalledWith({
      granularity: "month",
      preset: "last_6_months",
    });

    const spending = screen.getByRole("region", {
      name: "Spending this month",
    });
    const groceries = await within(spending).findByRole("link", {
      name: /Groceries/u,
    });
    expect(groceries.getAttribute("href")).toMatch(/^\/transactions\?/u);
    expect(groceries.getAttribute("href")).toContain("groceries");
    expect(groceries.getAttribute("href")).toContain("2026-09-01");

    const glance = screen.getByRole("region", { name: "Accounts" });
    expect(
      await within(glance).findByRole("link", { name: /BPI Savings/u })
    ).toHaveAttribute("href", "/accounts/account-1");
  });

  it("links recent transactions to their detail and to the full history", async () => {
    renderWithProviders(<OverviewPage household={HOUSEHOLD_A} />);

    const recent = await screen.findByRole("region", {
      name: "Recent activity",
    });
    expect(
      await within(recent).findByRole("link", { name: /Weekly market/u })
    ).toHaveAttribute("href", "/transactions/t-1");
    expect(
      within(recent).getByRole("link", { name: /Rice and eggs/u })
    ).toHaveAttribute("href", "/transactions/t-2");
    expect(
      within(recent).getByRole("link", { name: "All transactions" })
    ).toHaveAttribute("href", "/transactions");
    expect(transactionsList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 8, paidStatuses: [] })
    );
  });

  it("shows a skeleton per section while each report loads", async () => {
    accountsList.mockImplementation(never);
    const { unmount } = renderWithProviders(
      <OverviewPage household={HOUSEHOLD_A} />
    );
    expect(
      await screen.findByRole("region", { name: "Loading overview" })
    ).toHaveAttribute("aria-busy", "true");
    unmount();

    serveLedger();
    for (const mock of [
      netWorth,
      netWorthHistory,
      cashFlow,
      spendingByCategory,
      transactionsList,
    ]) {
      mock.mockImplementation(never);
    }
    renderWithProviders(<OverviewPage household={HOUSEHOLD_A} />);
    for (const name of [
      "Net worth",
      "This month",
      "Net worth history",
      "Spending this month",
      "Recent activity",
      "Coming up",
    ]) {
      expect(await screen.findByRole("region", { name })).toHaveAttribute(
        "aria-busy",
        "true"
      );
    }
    expect(screen.queryByText("₱12,500.00")).toBeNull();
  });

  it("guides a new household to accounts, transactions and imports", async () => {
    const user = userEvent.setup();
    serveEmptyHousehold();
    renderWithProviders(<OverviewPage household={HOUSEHOLD_A} />);

    const start = await screen.findByRole("region", { name: "Get started" });
    expect(
      within(start).getByRole("heading", { name: "Let’s set up Mallari Home" })
    ).toBeInTheDocument();
    expect(
      within(start).getByRole("link", { name: /Import from CSV/u })
    ).toHaveAttribute("href", "/imports");
    await user.click(
      within(start).getByRole("button", { name: /Add an account/u })
    );
    expect(actions.composeAccount).toHaveBeenCalled();
    await user.click(
      within(start).getByRole("button", { name: /Record a transaction/u })
    );
    expect(actions.compose).toHaveBeenCalledWith({
      kind: "expense",
      type: "transaction",
    });
    expect(screen.queryByRole("region", { name: "Net worth" })).toBeNull();
  });

  it("points a household with accounts but no transactions at adding or importing", async () => {
    const user = userEvent.setup();
    transactionsList.mockResolvedValue(page([]));
    renderWithProviders(<OverviewPage household={HOUSEHOLD_A} />);

    const recent = await screen.findByRole("region", {
      name: "Recent activity",
    });
    expect(
      await within(recent).findByText("No transactions yet")
    ).toBeInTheDocument();
    expect(
      within(recent).getByRole("link", { name: /Import from CSV/u })
    ).toHaveAttribute("href", "/imports");
    await user.click(
      within(recent).getByRole("button", { name: /Add a transaction/u })
    );
    expect(actions.compose).toHaveBeenCalledWith({
      kind: "expense",
      type: "transaction",
    });
  });

  it("follows the active household and never shows the previous one's figures", async () => {
    const user = userEvent.setup();
    const Switcher = () => {
      const [current, setCurrent] = useState(HOUSEHOLD_A);
      return (
        <>
          <button
            onClick={() => {
              server.active = "household-b";
              setCurrent(HOUSEHOLD_B);
            }}
            type="button"
          >
            Switch household
          </button>
          <OverviewPage household={current} />
        </>
      );
    };
    renderWithProviders(<Switcher />);
    await screen.findByRole("region", { name: "Net worth" });
    expect(await within(worthOf()).findByText("₱12,500.00")).toBeVisible();
    expect(await within(monthOf()).findByText("plus ₱5,000.00")).toBeVisible();
    expect(
      await screen.findByRole("link", { name: /Weekly market/u })
    ).toBeInTheDocument();

    const pendingNetWorth = Promise.withResolvers<unknown>();
    const pendingCashFlow = Promise.withResolvers<unknown>();
    netWorth.mockImplementationOnce(() => pendingNetWorth.promise);
    cashFlow.mockImplementationOnce(() => pendingCashFlow.promise);
    await user.click(screen.getByRole("button", { name: "Switch household" }));

    const glance = await screen.findByRole("region", { name: "Accounts" });
    expect(
      await within(glance).findByRole("link", { name: /GCash/u })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Beach snacks/u })
    ).toHaveAttribute("href", "/transactions/t-9");
    expect(screen.queryByRole("link", { name: /Weekly market/u })).toBeNull();
    expect(worthOf()).toHaveAttribute("aria-busy", "true");
    expect(within(worthOf()).queryByText("₱12,500.00")).toBeNull();
    expect(monthOf()).toHaveAttribute("aria-busy", "true");
    expect(within(monthOf()).queryByText("plus ₱5,000.00")).toBeNull();

    pendingNetWorth.resolve({
      byType: [],
      defaultCurrency: "PHP",
      positions: [position("PHP", "900.000000", "2500")],
      today: "2026-09-24",
    });
    pendingCashFlow.resolve({
      defaultCurrency: "PHP",
      monthly: [],
      months: ["2026-09"],
      period: monthPeriod,
      totals: [
        {
          currencyCode: "PHP",
          expense: "100.000000",
          income: "700.000000",
          net: "600.000000",
        },
      ],
    });
    expect(await within(worthOf()).findByText("₱900.00")).toBeVisible();
    expect(await within(monthOf()).findByText("plus ₱700.00")).toBeVisible();
    expect(accountsList).toHaveBeenCalledTimes(2);
  });
});
