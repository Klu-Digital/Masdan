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
const attachmentsList = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-household", () => ({
  useHousehold: () => ({
    can: () => true,
    session: { user: { id: "user-1" } },
  }),
}));

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList },
      attachments: { list: attachmentsList },
      categories: { list: categoriesList },
      tags: { list: tagsList },
      transactions: { create },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TransactionForm } = await import("./transaction-form");

const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const GROCERIES = "00000000-0000-4000-8000-000000000002";
const SALARY = "00000000-0000-4000-8000-000000000003";
const TAG = "00000000-0000-4000-8000-000000000004";
const DINING = "00000000-0000-4000-8000-000000000005";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderForm = (kind: "expense" | "income" = "expense") => {
  const onSaved = vi.fn();
  render(
    <TransactionForm
      actions={({ isSubmitting }) => (
        <button disabled={isSubmitting} type="submit">
          Add
        </button>
      )}
      activeOrganizationId="household-1"
      householdCurrency="PHP"
      kind={kind}
      onSaved={onSaved}
      timezone="Asia/Manila"
    />,
    { wrapper: Wrapper }
  );
  return { onSaved };
};

beforeEach(() => {
  create.mockReset();
  accountsList.mockResolvedValue([
    {
      accountClass: "asset",
      accountType: "bank",
      archivedAt: null,
      color: null,
      currencyCode: "PHP",
      id: ACCOUNT,
      name: "BPI Savings",
    },
  ]);
  categoriesList.mockResolvedValue([
    {
      archivedAt: null,
      color: "green",
      icon: "🛒",
      id: GROCERIES,
      name: "Groceries",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "orange",
      icon: "🍽️",
      id: DINING,
      name: "Food & Dining",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "emerald",
      icon: "💼",
      id: SALARY,
      name: "Salary",
      type: "income",
    },
  ]);
  tagsList.mockResolvedValue([
    { archivedAt: null, color: "blue", id: TAG, name: "Vacation" },
  ]);
  create.mockResolvedValue({ id: "transaction-1" });
  attachmentsList.mockReset().mockResolvedValue([
    {
      contentType: "application/pdf",
      createdAt: new Date("2026-01-05T00:00:00Z"),
      id: "file-1",
      name: "receipt.pdf",
      size: 2048,
      status: "ready",
      transactionId: "transaction-1",
      userId: "user-1",
    },
  ]);
});

const chooseCategory = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
  label = "Category"
) => {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name }));
};

describe("TransactionForm", () => {
  it("records an expense with the only account preselected, a tag and a note", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderForm();
    const amount = await screen.findByLabelText("Amount");
    await user.type(amount, "125,5");
    expect(amount).toHaveValue("125.5");
    await chooseCategory(user, /Groceries/u);
    await user.type(screen.getByLabelText("Note"), "Weekly market");
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Vacation" }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: ACCOUNT,
        amount: "125.5",
        categoryId: GROCERIES,
        notes: "Weekly market",
        paidStatus: "paid",
        splits: [],
        tagIds: [TAG],
      })
    );
    expect(onSaved).toHaveBeenCalledWith("transaction-1");
  });

  it("manages attachments only when editing an existing entry", async () => {
    const { unmount } = render(
      <TransactionForm
        actions={() => null}
        activeOrganizationId="household-1"
        householdCurrency="PHP"
        kind="expense"
        onSaved={vi.fn()}
        timezone="Asia/Manila"
        transaction={
          {
            accountId: ACCOUNT,
            amount: "125.500000",
            categoryId: GROCERIES,
            currencyCode: "PHP",
            id: "transaction-1",
            notes: null,
            paidStatus: "paid",
            splits: [],
            tags: [],
            transactionDate: "2026-01-05",
          } as never
        }
      />,
      { wrapper: Wrapper }
    );

    expect(await screen.findByText("receipt.pdf")).toBeInTheDocument();
    expect(attachmentsList).toHaveBeenCalledWith({
      transactionId: "transaction-1",
    });
    unmount();

    renderForm();
    await screen.findByLabelText("Amount");
    expect(
      screen.queryByRole("region", { name: "Attachments" })
    ).not.toBeInTheDocument();
  });

  it("offers only categories of the chosen kind", async () => {
    const user = userEvent.setup();
    renderForm("income");
    await screen.findByLabelText("Amount");
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(
      await screen.findByRole("option", { name: /Salary/u })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Groceries/u })
    ).not.toBeInTheDocument();
  });

  it("marks a bill unpaid", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(await screen.findByLabelText("Amount"), "80");
    await chooseCategory(user, /Groceries/u);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ paidStatus: "unpaid" })
    );
  });

  it("splits across categories and takes the first line as the parent", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(await screen.findByLabelText("Amount"), "125.50");
    await chooseCategory(user, /Groceries/u);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Split" }));

    expect(screen.getByLabelText("Line 1 amount")).toHaveValue("125.50");
    await chooseCategory(user, /Food & Dining/u, "Line 2 category");
    await user.clear(screen.getByLabelText("Line 1 amount"));
    await user.type(screen.getByLabelText("Line 1 amount"), "100");
    await user.type(screen.getByLabelText("Line 2 amount"), "25.50");
    expect(screen.getByText("Fully allocated")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: GROCERIES,
        splits: [
          { amount: "100", categoryId: GROCERIES },
          { amount: "25.50", categoryId: DINING },
        ],
      })
    );
  });

  it("refuses a split that doesn't add up", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(await screen.findByLabelText("Amount"), "125.50");
    await chooseCategory(user, /Groceries/u);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Split" }));
    await chooseCategory(user, /Food & Dining/u, "Line 2 category");
    await user.clear(screen.getByLabelText("Line 1 amount"));
    await user.type(screen.getByLabelText("Line 1 amount"), "100");
    await user.type(screen.getByLabelText("Line 2 amount"), "20");
    expect(screen.getByText(/left to allocate/u)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Split lines must add up to the amount")
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("opens prefilled from quick entry and flags what it could not settle", async () => {
    const GCASH = "00000000-0000-4000-8000-000000000009";
    accountsList.mockResolvedValue([
      {
        accountClass: "asset",
        accountType: "bank",
        archivedAt: null,
        color: null,
        currencyCode: "PHP",
        id: ACCOUNT,
        name: "BPI Savings",
      },
      {
        accountClass: "asset",
        accountType: "e_wallet",
        archivedAt: null,
        color: null,
        currencyCode: "PHP",
        id: GCASH,
        name: "GCash",
      },
    ]);
    const user = userEvent.setup();
    render(
      <TransactionForm
        actions={() => <button type="submit">Add</button>}
        activeOrganizationId="household-1"
        householdCurrency="PHP"
        kind="expense"
        onSaved={vi.fn()}
        prefill={{
          issues: [
            {
              field: "accountId",
              message: "Could be BPI Savings or GCash — choose one",
            },
          ],
          values: {
            amount: "400",
            categoryId: DINING,
            notes: "dinner at jollibee",
            paidStatus: "paid",
            transactionDate: "2026-09-25",
          },
        }}
        timezone="Asia/Manila"
      />,
      { wrapper: Wrapper }
    );

    expect(
      await screen.findByText("Could be BPI Savings or GCash — choose one")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("400");
    expect(screen.getByLabelText("Note")).toHaveValue("dinner at jollibee");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
      "Food & Dining"
    );
    const account = screen.getByRole("combobox", { name: "Account" });
    expect(account).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(account).toHaveFocus());

    await user.click(account);
    await user.click(await screen.findByRole("option", { name: /GCash/u }));
    expect(
      screen.queryByText("Could be BPI Savings or GCash — choose one")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: GCASH,
        amount: "400",
        categoryId: DINING,
        notes: "dinner at jollibee",
        transactionDate: "2026-09-25",
      })
    );
  });
});
