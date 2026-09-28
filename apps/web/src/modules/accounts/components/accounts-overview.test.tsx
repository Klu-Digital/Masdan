import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { ActiveHousehold } from "@/components/household-gate";
import { renderWithProviders } from "@/test/render";
import { createQueryClient } from "@/utils/orpc";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

const accountsList = vi.hoisted(() => vi.fn());
const listStatements = vi.hoisted(() => vi.fn());
const netWorth = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList, listStatements },
      reports: { netWorth },
    },
  };
});
vi.mock("@/components/app-actions", () => ({
  useAppActions: () => ({ composeAccount: vi.fn() }),
}));

const { AccountsOverview } = await import("./accounts-overview");

const household: ActiveHousehold = {
  activeOrganizationId: "home",
  can: () => false,
  currency: "PHP",
  isError: false,
  isPending: false,
  members: [],
  organization: null,
  profile: null,
  role: "",
  session: {
    session: {
      activeOrganizationId: "home",
      createdAt: new Date(),
      expiresAt: new Date(),
      id: "session-1",
      token: "token",
      updatedAt: new Date(),
      userId: "user-1",
    },
    user: {
      banned: null,
      createdAt: new Date(),
      email: "user@example.com",
      emailVerified: true,
      id: "user-1",
      image: null,
      name: "Test User",
      updatedAt: new Date(),
    },
  },
  timezone: "Asia/Manila",
};

const account = (id: string, balance: string, overrides = {}) => ({
  accountClass: "asset",
  accountType: "bank",
  archivedAt: null,
  availableCredit: null,
  balance,
  cardLastFour: null,
  cardNetwork: null,
  cardProductKey: null,
  color: null,
  currencyCode: "PHP",
  id,
  includeInNetWorth: true,
  institution: null,
  name: id,
  paymentDueDay: null,
  utilization: null,
  ...overrides,
});

it("shows per-currency group and account shares but none for excluded or archived accounts", async () => {
  accountsList.mockResolvedValue([
    account("Bank", "75"),
    account("Investment", "25", { accountType: "investment" }),
    account("Dollar investment", "5", {
      accountType: "investment",
      currencyCode: "USD",
    }),
    account("Excluded", "500", { includeInNetWorth: false }),
    account("Archived", "500", { archivedAt: new Date() }),
    account("Card", "30", {
      accountClass: "liability",
      accountType: "credit_card",
      utilization: "42",
    }),
  ]);
  listStatements.mockResolvedValue([]);
  netWorth.mockResolvedValue({
    byType: [],
    defaultCurrency: "PHP",
    positions: [],
    today: "2026-09-24",
  });

  renderWithProviders(<AccountsOverview household={household} />);

  const cash = await screen.findByRole("region", { name: "Cash & bank" });
  expect(within(cash).getAllByText(/75% of PHP assets/u)).toHaveLength(2);
  expect(
    within(cash).getByRole("link", { name: /Bank.*75% of PHP assets/u })
  ).toHaveAccessibleName(/₱75\.00·75% of PHP assets/u);
  expect(
    within(cash).getByRole("link", { name: /Excluded/u })
  ).not.toHaveTextContent("% of");
  const investments = screen.getByRole("region", { name: "Investments" });
  // The header and the one matching row each carry the share.
  expect(within(investments).getAllByText("25% of PHP assets")).toHaveLength(2);
  expect(within(investments).getAllByText("100% of USD assets")).toHaveLength(
    2
  );
  const bars = within(cash)
    .getAllByRole("meter", { hidden: true })
    .map((bar) => bar.getAttribute("aria-valuenow"));
  expect(bars).toEqual(["75", "75"]);
  expect(screen.getByRole("link", { name: /Card/u })).toHaveAccessibleName(
    /₱30\.00·100% of PHP liabilities.*42% used/u
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /Show 1 archived/u }));
  expect(screen.getByRole("link", { name: /Archived/u })).not.toHaveTextContent(
    "% of"
  );
});

it("places groups in asset and liability sections with separate currency totals", async () => {
  accountsList.mockResolvedValue([
    account("Bank", "100"),
    account("Dollar bank", "5", { currencyCode: "USD" }),
    account("Card", "30", {
      accountClass: "liability",
      accountType: "credit_card",
    }),
  ]);
  listStatements.mockResolvedValue([]);
  netWorth.mockResolvedValue({
    byType: [],
    defaultCurrency: "PHP",
    positions: [
      { assets: "100", currencyCode: "PHP", liabilities: "30", netWorth: "70" },
      { assets: "5", currencyCode: "USD", liabilities: "0", netWorth: "5" },
    ],
    today: "2026-09-24",
  });

  renderWithProviders(<AccountsOverview household={household} />);

  const assets = await screen.findByRole("region", { name: "Assets" });
  const liabilities = screen.getByRole("region", { name: "Liabilities" });
  expect(
    within(assets).getByRole("heading", { level: 2, name: "Assets" })
  ).toBeVisible();
  expect(
    within(liabilities).getByRole("heading", { level: 2, name: "Liabilities" })
  ).toBeVisible();
  expect(
    within(assets).getByRole("region", { name: "Cash & bank" })
  ).toBeVisible();
  expect(
    within(liabilities).getByRole("region", { name: "Credit cards" })
  ).toBeVisible();
  await waitFor(() => {
    expect(assets).toHaveTextContent("₱100.00");
    expect(assets).toHaveTextContent("$5.00");
  });
});

it("opens groups by default and toggles them with Enter and Space", async () => {
  accountsList.mockResolvedValue([account("Bank", "75")]);
  netWorth.mockResolvedValue({
    byType: [],
    defaultCurrency: "PHP",
    positions: [],
    today: "2026-09-24",
  });
  const user = userEvent.setup();
  renderWithProviders(<AccountsOverview household={household} />);

  const trigger = await screen.findByRole("button", { name: /Cash & bank/u });
  expect(trigger).toHaveAccessibleName(/Cash & bank.*₱75\.00.*100% of assets/u);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: /Bank/u })).toBeVisible();
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /Bank/u })
    ).not.toBeInTheDocument()
  );
  await user.keyboard("{ }");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByRole("link", { name: /Bank/u })).toBeVisible();
});

it("keeps accounts visible and offers a retry when net worth fails", async () => {
  accountsList.mockResolvedValue([account("Bank", "75")]);
  netWorth.mockRejectedValue(new Error("offline"));
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  renderWithProviders(<AccountsOverview household={household} />, queryClient);

  expect(await screen.findByRole("link", { name: /Bank/u })).toBeVisible();
  expect(await screen.findByText("Couldn’t load net worth")).toBeVisible();
  const calls = netWorth.mock.calls.length;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(netWorth).toHaveBeenCalledTimes(calls + 1));
});
