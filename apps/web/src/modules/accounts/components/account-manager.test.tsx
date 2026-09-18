import { QueryClientProvider } from "@tanstack/react-query";
import type * as TypeImport___tanstack_react_router from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof TypeImport___tanstack_react_router>();
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  };
});

const list = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
const currenciesList = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { archive, create, list, restore, update },
      currencies: { list: currenciesList },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { AccountManager } =
  await import("@/modules/accounts/components/account-manager");

const accounts = [
  {
    accountClass: "asset",
    accountType: "bank",
    archivedAt: null,
    balance: "0.000000",
    cardLastFour: null,
    cardNetwork: null,
    color: null,
    createdAt: new Date(),
    creditLimit: null,
    currencyCode: "PHP",
    icon: null,
    id: "account-1",
    includeInNetWorth: true,
    institution: null,
    liquidity: "liquid",
    name: "BPI Savings",
    notes: null,
    openingBalance: "0.000000",
    openingBalanceDate: "2026-01-01",
    organizationId: "household-1",
    ownerMemberIds: [],
    paymentDueDay: null,
    statementClosingDay: null,
    updatedAt: new Date(),
  },
];

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderManager = () =>
  render(
    <AccountManager
      activeOrganizationId="household-1"
      canArchive
      canCreate
      canRestore
      canUpdate
      defaultCurrency="PHP"
      members={[]}
    />,
    { wrapper: Wrapper }
  );

beforeEach(() => {
  list.mockReset();
  create.mockReset();
  update.mockReset();
  archive.mockReset();
  restore.mockReset();
  currenciesList.mockReset();
  list.mockResolvedValue(accounts);
  currenciesList.mockResolvedValue([
    {
      code: "PHP",
      minorUnits: 2,
      name: "Philippine peso",
      symbol: "₱",
      symbolNative: "₱",
    },
  ]);
});

describe("AccountManager", () => {
  it("opens the edit dialog from an account row", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("heading", { name: "Edit account" })
    ).toBeInTheDocument();
  });

  it("submits a credit-card account from the create dialog", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({ id: "account-2" });
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Add account" })
    );
    await user.type(screen.getByLabelText("Name"), "Metrobank World");
    await user.click(screen.getByText("Liability"));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Credit card" }));
    await user.type(screen.getByLabelText("Card network"), "Mastercard");
    await user.type(screen.getByLabelText("Last four digits"), "8155");
    await user.type(screen.getByLabelText("Credit limit"), "120000");
    await user.type(screen.getByLabelText("Statement closing day"), "4");
    await user.type(screen.getByLabelText("Payment due day"), "16");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(create).toHaveBeenCalled());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountClass: "liability",
        accountType: "credit_card",
        cardLastFour: "8155",
        cardNetwork: "Mastercard",
        creditLimit: "120000",
        paymentDueDay: 16,
        statementClosingDay: 4,
      })
    );
  });

  it("shows card metadata fields only for credit-card accounts", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Add account" })
    );
    expect(screen.queryByLabelText("Card network")).toBeNull();

    await user.click(screen.getByText("Liability"));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Credit card" }));

    expect(screen.getByLabelText("Card network")).toBeInTheDocument();
    expect(screen.getByLabelText("Last four digits")).toBeInTheDocument();
    expect(screen.getByLabelText("Credit limit")).toBeInTheDocument();
    expect(screen.getByLabelText("Statement closing day")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment due day")).toBeInTheDocument();
    expect(screen.queryByLabelText("Card number")).toBeNull();
  });
});
