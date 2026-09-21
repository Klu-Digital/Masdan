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
const categoriesList = vi.hoisted(() => vi.fn());
const tagsList = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList },
      categories: { list: categoriesList },
      tags: { list: tagsList },
      transactions: { archive, create, get, list, restore, update },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TransactionForm } =
  await import("@/modules/transactions/components/transaction-form");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderForm = () =>
  render(
    <TransactionForm
      activeOrganizationId="household-1"
      canCreate
      canUpdate
      onSaved={vi.fn()}
    />,
    { wrapper: Wrapper }
  );

beforeEach(() => {
  accountsList.mockReset();
  categoriesList.mockReset();
  tagsList.mockReset();
  create.mockReset();
  get.mockReset();
  list.mockReset();
  update.mockReset();
  archive.mockReset();
  restore.mockReset();
  accountsList.mockResolvedValue([
    {
      accountClass: "asset",
      accountType: "bank",
      archivedAt: null,
      currencyCode: "PHP",
      id: "00000000-0000-4000-8000-000000000001",
      name: "BPI Savings",
    },
  ]);
  categoriesList.mockResolvedValue([
    {
      archivedAt: null,
      color: "green",
      icon: "🛒",
      id: "00000000-0000-4000-8000-000000000002",
      name: "Groceries",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "orange",
      icon: "🍽️",
      id: "00000000-0000-4000-8000-000000000005",
      name: "Food & Dining",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "emerald",
      icon: "💼",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Salary",
      type: "income",
    },
  ]);
  tagsList.mockResolvedValue([
    {
      archivedAt: null,
      color: "blue",
      id: "00000000-0000-4000-8000-000000000004",
      name: "Vacation",
    },
  ]);
  create.mockResolvedValue({ id: "transaction-1" });
});

describe("TransactionForm", () => {
  it("submits a transaction with account, category, tag, status, and notes", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Add transaction", { selector: "div" });

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.click(screen.getByRole("option", { name: /BPI Savings/iu }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(screen.getByRole("option", { name: /Groceries/iu }));
    await user.type(screen.getByLabelText("Amount"), "125.50");
    await user.click(screen.getByRole("button", { name: "Vacation" }));
    await user.type(screen.getByLabelText("Notes"), "Trip groceries");
    await user.click(
      screen.getByRole("button", { name: "Create transaction" })
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "00000000-0000-4000-8000-000000000001",
        amount: "125.50",
        categoryId: "00000000-0000-4000-8000-000000000002",
        notes: "Trip groceries",
        paidStatus: "paid",
        tagIds: ["00000000-0000-4000-8000-000000000004"],
      })
    );
  });

  it("shows all categories in the category combobox", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Add transaction", { selector: "div" });

    await user.click(screen.getByRole("combobox", { name: "Category" }));

    expect(
      screen.getByRole("option", { name: /Salary/iu })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Groceries/iu })
    ).toBeInTheDocument();
  });

  it("adds and removes reconciled split lines", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Add transaction", { selector: "div" });

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.click(screen.getByRole("option", { name: /BPI Savings/iu }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(screen.getByRole("option", { name: /Groceries/iu }));
    await user.type(screen.getByLabelText("Amount"), "125.50");
    await user.click(screen.getByRole("button", { name: "Split transaction" }));

    expect(screen.getByLabelText("Split line 1 amount")).toHaveValue("125.50");
    await user.click(
      screen.getByPlaceholderText("Select split line 2 category")
    );
    await user.click(screen.getByRole("option", { name: /Food & Dining/iu }));
    await user.clear(screen.getByLabelText("Split line 1 amount"));
    await user.type(screen.getByLabelText("Split line 1 amount"), "100");
    await user.type(screen.getByLabelText("Split line 2 amount"), "25.50");
    await user.clear(screen.getByLabelText("Split line 1 amount"));
    await user.type(screen.getByLabelText("Split line 1 amount"), "125.50");
    await user.click(
      screen.getByRole("button", { name: "Remove split line 2" })
    );

    await user.click(
      screen.getByRole("button", { name: "Create transaction" })
    );
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        splits: [{ amount: "125.50", categoryId: expect.any(String) }],
      })
    );
  });

  it("blocks an unreconciled split", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByText("Add transaction", { selector: "div" });

    await user.click(screen.getByRole("combobox", { name: "Account" }));
    await user.click(screen.getByRole("option", { name: /BPI Savings/iu }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(screen.getByRole("option", { name: /Groceries/iu }));
    await user.type(screen.getByLabelText("Amount"), "125.50");
    await user.click(screen.getByRole("button", { name: "Split transaction" }));
    await user.clear(screen.getByLabelText("Split line 1 amount"));
    await user.type(screen.getByLabelText("Split line 1 amount"), "100");
    await user.type(screen.getByLabelText("Split line 2 amount"), "20");
    await user.click(
      screen.getByRole("button", { name: "Create transaction" })
    );

    expect(create).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Split amounts must equal the transaction amount")
    ).toBeInTheDocument();
  });
});
