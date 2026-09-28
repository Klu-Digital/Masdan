import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import type { ActiveHousehold } from "@/components/household-gate";
import { renderWithProviders } from "@/test/render";
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
