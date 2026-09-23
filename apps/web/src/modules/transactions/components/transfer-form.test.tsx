import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const accountsList = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const deleteTransfer = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList },
      transfers: { create, delete: deleteTransfer, get, update },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TransferForm } =
  await import("@/modules/transactions/components/transfer-form");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderForm = (destinationAccountId?: string) =>
  render(
    <TransferForm
      activeOrganizationId="household-1"
      canCreate
      canUpdate
      destinationAccountId={destinationAccountId}
      onSaved={vi.fn()}
    />,
    { wrapper: Wrapper }
  );

beforeEach(() => {
  accountsList.mockReset();
  create.mockReset();
  get.mockReset();
  update.mockReset();
  deleteTransfer.mockReset();
  accountsList.mockResolvedValue([
    {
      accountClass: "asset",
      accountType: "bank",
      archivedAt: null,
      currencyCode: "PHP",
      id: "00000000-0000-4000-8000-000000000001",
      name: "BPI Savings",
    },
    {
      accountClass: "asset",
      accountType: "e_wallet",
      archivedAt: null,
      currencyCode: "PHP",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Maya",
    },
  ]);
  create.mockResolvedValue({ id: "transfer-1" });
});

describe("TransferForm", () => {
  it("keeps a card payment destination fixed and only offers asset sources", async () => {
    const user = userEvent.setup();
    accountsList.mockResolvedValueOnce([
      {
        accountClass: "asset",
        archivedAt: null,
        currencyCode: "PHP",
        id: "00000000-0000-4000-8000-000000000001",
        name: "Checking",
      },
      {
        accountClass: "liability",
        archivedAt: null,
        currencyCode: "PHP",
        id: "00000000-0000-4000-8000-000000000002",
        name: "Credit card",
      },
    ]);
    renderForm("00000000-0000-4000-8000-000000000002");
    expect(await screen.findByText("Credit card — PHP")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "To account" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "From account" }));
    expect(
      screen.getByRole("option", { name: /Checking/iu })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Credit card/iu })
    ).not.toBeInTheDocument();
  });
  it("submits both account sides and amounts", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Add transfer", { selector: "div" });

    await user.click(screen.getByRole("combobox", { name: "From account" }));
    await user.click(screen.getByRole("option", { name: /BPI Savings/iu }));
    await user.click(screen.getByRole("combobox", { name: "To account" }));
    await user.click(screen.getByRole("option", { name: /Maya/iu }));
    await user.type(screen.getByLabelText("From amount"), "125.50");
    await user.type(screen.getByLabelText("To amount"), "125.50");
    await user.type(screen.getByLabelText("Notes"), "Move money");
    await user.click(screen.getByRole("button", { name: "Create transfer" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAccountId: "00000000-0000-4000-8000-000000000002",
        destinationAmount: "125.50",
        notes: "Move money",
        sourceAccountId: "00000000-0000-4000-8000-000000000001",
        sourceAmount: "125.50",
      })
    );
  });
});
