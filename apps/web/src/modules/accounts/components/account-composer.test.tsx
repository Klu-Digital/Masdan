import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const create = vi.hoisted(() => vi.fn());
const currenciesList = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: { accounts: { create }, currencies: { list: currenciesList } },
  };
});

const { AccountComposer } = await import("./account-composer");

const renderComposer = () => {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <AccountComposer
      activeOrganizationId="household-1"
      defaults={{ currency: "PHP", members: [], timezone: "Asia/Manila" }}
      onOpenChange={onOpenChange}
      open
      request={{}}
    />
  );
  return { onOpenChange };
};

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "account-1", name: "Amore Visa" });
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
});
