import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const accountsList = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: accountsList },
      transfers: { create },
    }),
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TransferForm } = await import("./transfer-form");

const BANK = "00000000-0000-4000-8000-000000000001";
const WALLET = "00000000-0000-4000-8000-000000000002";
const CARD = "00000000-0000-4000-8000-000000000003";
const USD = "00000000-0000-4000-8000-000000000004";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const account = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({
  accountClass: "asset",
  accountType: "bank",
  archivedAt: null,
  color: null,
  currencyCode: "PHP",
  id,
  name,
  ...extra,
});

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "transfer-1" });
  accountsList.mockResolvedValue([
    account(BANK, "BPI Savings"),
    account(WALLET, "GCash", { accountType: "e_wallet" }),
    account(CARD, "Amore Visa", {
      accountClass: "liability",
      accountType: "credit_card",
    }),
    account(USD, "Wise USD", { currencyCode: "USD" }),
  ]);
});

const renderForm = (props: Partial<Parameters<typeof TransferForm>[0]> = {}) =>
  render(
    <TransferForm
      actions={() => <button type="submit">Save</button>}
      activeOrganizationId="household-1"
      onSaved={vi.fn()}
      timezone="Asia/Manila"
      {...props}
    />,
    { wrapper: Wrapper }
  );

const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  name: RegExp
) => {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name }));
};

describe("TransferForm", () => {
  it("mirrors the amount between same-currency accounts", async () => {
    const user = userEvent.setup();
    renderForm({ sourceAccountId: BANK });
    await user.type(await screen.findByLabelText("Amount"), "2500");
    await pick(user, "To", /GCash/u);
    expect(screen.queryByLabelText(/Amount received/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: WALLET,
        destinationAmount: "2500",
        sourceAccountId: BANK,
        sourceAmount: "2500",
      })
    );
  });

  it("asks what arrived when currencies differ", async () => {
    const user = userEvent.setup();
    renderForm({ sourceAccountId: BANK });
    await user.type(await screen.findByLabelText("Amount"), "5600");
    await pick(user, "To", /Wise USD/u);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Enter the amount received")
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Amount received in USD/u), "100");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationAmount: "100",
          sourceAmount: "5600",
        })
      )
    );
  });

  it("swaps the two accounts", async () => {
    const user = userEvent.setup();
    renderForm({ destinationAccountId: WALLET, sourceAccountId: BANK });
    await user.type(await screen.findByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Swap accounts" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationAccountId: BANK,
          sourceAccountId: WALLET,
        })
      )
    );
  });

  it("pays a card from asset accounts only, with quick amounts", async () => {
    const user = userEvent.setup();
    renderForm({
      destinationAccountId: CARD,
      lockDestination: true,
      suggestions: [{ amount: "4200.000000", label: "Statement" }],
    });
    expect(await screen.findByText("Amore Visa")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "To" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "From" }));
    expect(
      await screen.findByRole("option", { name: /BPI Savings/u })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Amore Visa/u })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /BPI Savings/u }));

    await user.click(screen.getByRole("button", { name: /Statement/u }));
    expect(screen.getByLabelText("Amount")).toHaveValue("4200");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationAccountId: CARD,
          sourceAccountId: BANK,
          sourceAmount: "4200",
        })
      )
    );
  });
});
