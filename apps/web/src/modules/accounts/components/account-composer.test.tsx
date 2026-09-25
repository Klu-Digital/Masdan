import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

import type { AccountDetail } from "./account-composer";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const currenciesList = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { create, update },
      currencies: { list: currenciesList },
    },
  };
});

const { AccountComposer } = await import("./account-composer");

const renderComposer = (request: { account?: AccountDetail } = {}) => {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <AccountComposer
      activeOrganizationId="household-1"
      defaults={{ currency: "PHP", members: [], timezone: "Asia/Manila" }}
      onOpenChange={onOpenChange}
      open
      request={request}
    />
  );
  return { onOpenChange };
};

const savedCard = (overrides: Partial<AccountDetail> = {}): AccountDetail => ({
  accountClass: "liability",
  accountType: "credit_card",
  archivedAt: null,
  availableCredit: "90000.000000",
  balance: "10000.000000",
  cardLastFour: "4242",
  cardNetwork: "Mastercard",
  cardProductKey: null,
  color: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  creditLimit: "100000.000000",
  currencyCode: "PHP",
  icon: null,
  id: "account-1",
  includeInNetWorth: true,
  institution: "BPI",
  liquidity: null,
  name: "BPI Gold Rewards",
  notes: null,
  openingBalance: "10000.000000",
  openingBalanceDate: "2026-01-01",
  organizationId: "household-1",
  ownerMemberIds: [],
  paymentDueDay: 15,
  statementClosingDay: 25,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  utilization: "10.00",
  ...overrides,
});

const startCreditCard = async (user: ReturnType<typeof userEvent.setup>) => {
  renderComposer();
  await user.click(await screen.findByRole("button", { name: /Credit card/u }));
  await user.type(await screen.findByLabelText("Name"), "My card");
};

const cardFace = () =>
  document.querySelector("[data-slot='credit-card-visual']");

const chooseBank = async (
  user: ReturnType<typeof userEvent.setup>,
  bank: string
) => {
  await user.click(screen.getByRole("combobox", { name: "Institution" }));
  await user.click(await screen.findByRole("option", { name: bank }));
};

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "account-1", name: "Amore Visa" });
  update.mockReset();
  update.mockResolvedValue({ id: "account-1", name: "BPI Gold Rewards" });
  currenciesList.mockResolvedValue([
    {
      code: "PHP",
      minorUnits: 2,
      name: "Philippine Peso",
      symbol: "₱",
      symbolNative: "₱",
    },
  ]);
});

describe("AccountComposer", () => {
  it("starts by asking what kind of account it is", async () => {
    renderComposer();
    expect(await screen.findByText("Cash & bank")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Credit card/u })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mortgage/u })
    ).toBeInTheDocument();
  });

  it("creates a credit card as a liability with its card details", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderComposer();
    await user.click(
      await screen.findByRole("button", { name: /Credit card/u })
    );

    await user.type(await screen.findByLabelText("Name"), "Amore Visa");
    await user.type(screen.getByLabelText("Amount owed"), "4200");
    await user.type(screen.getByLabelText("Credit limit"), "50000");
    await user.type(screen.getByLabelText("Last four digits"), "4242");
    await user.click(screen.getByRole("button", { name: "Visa" }));
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountClass: "liability",
        accountType: "credit_card",
        cardLastFour: "4242",
        cardNetwork: "Visa",
        creditLimit: "50000",
        currencyCode: "PHP",
        liquidity: null,
        name: "Amore Visa",
        openingBalance: "4200",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps card fields off other accounts and defaults a zero balance", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(await screen.findByRole("button", { name: /Bank/u }));
    expect(screen.queryByLabelText("Credit limit")).not.toBeInTheDocument();
    await user.type(await screen.findByLabelText("Name"), "BPI Savings");
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountClass: "asset",
        accountType: "bank",
        cardLastFour: null,
        creditLimit: null,
        liquidity: "liquid",
        openingBalance: "0",
      })
    );
  });

  it("lets you go back and choose a different kind", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.click(await screen.findByRole("button", { name: /E-wallet/u }));
    await user.click(await screen.findByRole("button", { name: "Change" }));
    expect(await screen.findByText("Cash & bank")).toBeInTheDocument();
  });

  it("narrows products to the issuing bank and network, then saves the choice", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "BPI");
    await user.click(screen.getByRole("button", { name: "Mastercard" }));

    await user.click(screen.getByRole("combobox", { name: "Card" }));
    expect(
      await screen.findByRole("option", { name: /BPI Gold Rewards/u })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /BDO Visa Gold/u })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", {
        name: /BPI Signature Mastercard|^BPI Signature$/u,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Other \/ not listed/u })
    ).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Card" }), "gold");
    await user.click(
      await screen.findByRole("option", { name: /BPI Gold Rewards/u })
    );
    expect(cardFace()).toHaveTextContent("Gold Rewards");
    expect(cardFace()).toHaveTextContent("BPI");

    await user.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cardNetwork: "Mastercard",
        cardProductKey: "bpi-gold-rewards-mastercard",
        institution: "Bank of the Philippine Islands",
      })
    );
  });

  it("fills in the bank and network from a product found by search", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);

    await user.type(
      screen.getByRole("combobox", { name: "Card" }),
      "shopmore orange"
    );
    await user.click(
      await screen.findByRole("option", {
        name: /ShopMore Mastercard — Orange/u,
      })
    );
    expect(
      screen.getByRole("combobox", { name: "Institution" })
    ).toHaveTextContent("BDO");
    expect(screen.getByRole("button", { name: "Mastercard" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cardNetwork: "Mastercard",
        cardProductKey: "bdo-shopmore-mastercard-orange",
        institution: "BDO Unibank",
      })
    );
  });

  it("saves an unlisted card with no product and a generic preview", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "BPI");
    expect(cardFace()).toHaveTextContent("My card");

    await user.click(screen.getByRole("combobox", { name: "Card" }));
    await user.click(
      await screen.findByRole("option", { name: /Other \/ not listed/u })
    );
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cardProductKey: null,
        institution: "Bank of the Philippine Islands",
      })
    );
  });

  it("locks the network to the picked card and frees it again for Other", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "BPI");
    await user.type(screen.getByRole("combobox", { name: "Card" }), "gold");
    await user.click(
      await screen.findByRole("option", { name: /BPI Gold Rewards/u })
    );

    const mastercard = screen.getByRole("button", { name: "Mastercard" });
    expect(mastercard).toHaveAttribute("aria-pressed", "true");
    expect(mastercard).toBeDisabled();
    expect(screen.getByRole("button", { name: "Visa" })).toBeDisabled();
    expect(screen.getByText("Set by the card you picked.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Card" }));
    await user.click(
      await screen.findByRole("option", { name: /Other \/ not listed/u })
    );
    expect(screen.getByRole("button", { name: "Visa" })).toBeEnabled();
  });

  it("keeps other-network cards listed, after the matching ones", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "HSBC");
    await user.click(screen.getByRole("button", { name: "Mastercard" }));
    await user.click(screen.getByRole("combobox", { name: "Card" }));

    const options = await screen.findAllByRole("option");
    const names = options.map((option) => option.textContent ?? "");
    const live = names.findIndex((name) => name.includes("Live+"));
    const red = names.findIndex((name) => name.includes("Red Platinum"));
    expect(live).toBeGreaterThan(-1);
    expect(red).toBeGreaterThan(-1);
    expect(red).toBeLessThan(live);
  });

  it("offers a suggestion for an existing generic card without applying it", async () => {
    const user = userEvent.setup();
    renderComposer({ account: savedCard() });

    const suggestion = await screen.findByRole("button", {
      name: "BPI Gold Rewards",
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: "account-1", cardProductKey: null })
    );

    await user.click(suggestion);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cardProductKey: "bpi-gold-rewards-mastercard",
      })
    );
  });

  it("keeps editing a card whose saved product left the catalog", async () => {
    const user = userEvent.setup();
    renderComposer({
      account: savedCard({ cardProductKey: "bpi-retired-in-2030" }),
    });

    expect(
      await screen.findByText(/no longer in Masdan’s catalog/u)
    ).toBeInTheDocument();
    expect(cardFace()).toHaveTextContent("BPI Gold Rewards");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ cardProductKey: "bpi-retired-in-2030" })
    );
  });

  it("takes a bank outside the catalog under Others, with only a generic card", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "Others");
    await user.type(screen.getByLabelText("Bank name"), "Tagum Cooperative");

    await user.click(screen.getByRole("combobox", { name: "Card" }));
    expect(
      await screen.findByRole("option", { name: /Other \/ not listed/u })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(cardFace()).toHaveTextContent("Tagum Cooperative");

    await user.click(screen.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cardProductKey: null,
        institution: "Tagum Cooperative",
      })
    );
  });

  it("opens an existing card under a non-catalog bank in Others mode", async () => {
    renderComposer({
      account: savedCard({
        institution: "Tagum Cooperative",
        name: "Coop Card",
      }),
    });
    expect(await screen.findByLabelText("Bank name")).toHaveValue(
      "Tagum Cooperative"
    );
    expect(
      screen.getByRole("combobox", { name: "Institution" })
    ).toHaveTextContent("Others");
  });

  it("shows networks as their marks while keeping their names", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    const amex = screen.getByRole("button", { name: "American Express" });
    expect(amex.querySelector("[data-slot='network-mark']")).not.toBeNull();
    await user.click(amex);
    expect(amex).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the colour choice once a catalog card supplies the design", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await user.click(screen.getByRole("button", { name: "More options" }));
    expect(
      screen.getByRole("group", { name: "Account color" })
    ).toBeInTheDocument();

    await chooseBank(user, "BPI");
    await user.type(screen.getByRole("combobox", { name: "Card" }), "gold");
    await user.click(
      await screen.findByRole("option", { name: /BPI Gold Rewards/u })
    );
    expect(
      screen.queryByRole("group", { name: "Account color" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Card" }));
    await user.click(
      await screen.findByRole("option", { name: /Other \/ not listed/u })
    );
    expect(
      await screen.findByRole("group", { name: "Account color" })
    ).toBeInTheDocument();
  });

  it("lists every card of the chosen bank, whatever its network", async () => {
    const user = userEvent.setup();
    await startCreditCard(user);
    await chooseBank(user, "Metrobank");
    await user.click(screen.getByRole("combobox", { name: "Card" }));
    expect(
      await screen.findByRole("option", { name: /Metrobank Rewards Plus/u })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Metrobank Toyota Mastercard/u })
    ).toBeInTheDocument();
  });
});
