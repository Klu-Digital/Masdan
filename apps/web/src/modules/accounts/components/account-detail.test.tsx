import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";

import type { ActiveHousehold } from "@/components/household-gate";
import { renderWithProviders } from "@/test/render";

import type { AccountDetail } from "./account-composer";

const getAccount = vi.hoisted(() => vi.fn());
const compose = vi.hoisted(() => vi.fn());
const listSnapshots = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: {
        get: getAccount,
        listSnapshots,
        listStatements: () => [],
        previewReconciliation: () => ({ calculatedBalance: "10000" }),
      },
      transactions: {
        list: () => ({ groups: [], items: [], total: 0 }),
        summary: () => ({ cashFlow: [] }),
      },
    }),
  };
});
vi.mock("@/components/app-actions", () => ({
  useAppActions: () => ({ compose, composeAccount: vi.fn(), inspect: vi.fn() }),
}));
vi.mock("@/hooks/use-household", () => ({
  useHousehold: () => ({ activeOrganizationId: "home" }),
}));

const { AccountDetailPage } = await import("./account-detail");

const household: ActiveHousehold = {
  activeOrganizationId: "home",
  can: () => true,
  currency: "PHP",
  isError: false,
  isPending: false,
  members: [],
  organization: null,
  profile: null,
  role: "owner",
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

const account: AccountDetail = {
  accountClass: "asset",
  accountType: "bank",
  archivedAt: null,
  availableCredit: null,
  balance: "10000",
  cardLastFour: null,
  cardNetwork: null,
  cardProductKey: null,
  color: null,
  createdAt: new Date(),
  creditLimit: null,
  currencyCode: "PHP",
  hasFinancialHistory: false,
  icon: null,
  id: "account-1",
  includeInNetWorth: true,
  institution: "BPI",
  liquidity: null,
  name: "Household savings",
  notes: null,
  openingBalance: "10000",
  openingBalanceDate: "2026-01-01",
  organizationId: "home",
  ownerMemberIds: [],
  paymentDueDay: null,
  statementClosingDay: null,
  updatedAt: new Date(),
  utilization: null,
};

beforeEach(() => {
  compose.mockClear();
  getAccount.mockResolvedValue(account);
  listSnapshots.mockResolvedValue([]);
});

it("groups the balance and monthly flow, keeping import in the actions menu", async () => {
  renderWithProviders(
    <AccountDetailPage accountId={account.id} household={household} />
  );
  const balance = await screen.findByRole("region", { name: "Balance" });
  expect(within(balance).getByText("In this month")).toBeVisible();
  expect(within(balance).getByText("Out this month")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Import CSV" })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add transaction" }));
  expect(compose).toHaveBeenCalledWith({
    accountId: account.id,
    kind: "expense",
    type: "transaction",
  });
  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(
    await screen.findByRole("menuitem", { name: "Import CSV" })
  ).toHaveAttribute("href", "/imports?accountId=account-1");
});

it("groups card figures and payment together, leaving statements separate", async () => {
  getAccount.mockResolvedValue({
    ...account,
    accountClass: "liability",
    accountType: "credit_card",
    availableCredit: "10000",
    creditLimit: "20000",
    paymentDueDay: 15,
    utilization: "50",
  });
  renderWithProviders(
    <AccountDetailPage accountId={account.id} household={household} />
  );
  const overview = await screen.findByRole("region", { name: "Card overview" });
  expect(within(overview).getByText("Balance owed")).toBeVisible();
  expect(within(overview).getByText("Credit limit")).toBeVisible();
  const payment = within(overview).getByRole("region", {
    name: "Next payment",
  });
  await userEvent
    .setup()
    .click(within(payment).getByRole("button", { name: "Pay card" }));
  expect(compose).toHaveBeenCalledWith(
    expect.objectContaining({
      destinationAccountId: account.id,
      type: "transfer",
    })
  );
  expect(
    within(overview).queryByRole("region", { name: "Statements" })
  ).toBeNull();
  expect(screen.getByRole("region", { name: "Statements" })).toBeVisible();
});

it("opens reconciliation from the account menu and distinguishes retained observations", async () => {
  listSnapshots.mockResolvedValue([
    {
      adjustment: "1000",
      adjustmentArchivedAt: new Date(),
      balance: "11000",
      effectiveDate: "2026-02-01",
      id: "snapshot",
      notes: "Bank check",
      source: "reconciliation",
      transactionId: "posting",
    },
    {
      adjustment: "0",
      adjustmentArchivedAt: null,
      balance: "10000",
      effectiveDate: "2026-02-02",
      id: "zero",
      notes: null,
      source: "reconciliation",
      transactionId: null,
    },
  ]);
  renderWithProviders(
    <AccountDetailPage accountId={account.id} household={household} />
  );
  expect(
    await screen.findByText(
      /Reconciliation · Bank check · Adjustment archived/u
    )
  ).toBeVisible();
  expect(screen.getAllByText(/Adjustment/u).length).toBeGreaterThan(1);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "More actions" }));
  const reconcileAction = await screen.findByRole("menuitem", {
    name: "Reconcile balance",
  });
  expect(reconcileAction.querySelector("svg")).not.toBeNull();
  await userEvent.setup().click(reconcileAction);
  expect(
    await screen.findByRole("dialog", { name: `Reconcile ${account.name}` })
  ).toBeVisible();
});

it("does not expose import or transaction actions to a read-only member", async () => {
  renderWithProviders(
    <AccountDetailPage
      accountId={account.id}
      household={{ ...household, can: () => false }}
    />
  );
  await screen.findByRole("heading", { name: account.name });
  expect(screen.queryByRole("button", { name: "Add transaction" })).toBeNull();
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
});
