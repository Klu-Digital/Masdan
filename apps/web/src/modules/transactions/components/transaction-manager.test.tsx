import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@/modules/transactions/components/transaction-form", () => ({
  TransactionFormDialog: () => <button type="button">Add transaction</button>,
}));
vi.mock("@/modules/transactions/components/transaction-table", () => ({
  TransactionTable: ({
    onSort,
    transactions,
  }: {
    onSort: (sortBy: "date" | "amount") => void;
    transactions: { id: string; notes: string | null }[];
  }) => (
    <div>
      {transactions.map((transaction) => (
        <div key={transaction.id}>{transaction.notes}</div>
      ))}
      <button onClick={() => onSort("amount")} type="button">
        Sort amount
      </button>
    </div>
  ),
}));

const accountsList = vi.hoisted(() => vi.fn());
const categoriesList = vi.hoisted(() => vi.fn());
const tagsList = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: accountsList },
      categories: { list: categoriesList },
      tags: { list: tagsList },
      transactions: { archive, list, restore },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TransactionManager } =
  await import("@/modules/transactions/components/transaction-manager");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const OWNER_ROLE = "owner";

const search = {
  accountIds: [],
  categoryIds: [],
  includeArchived: false,
  page: 1,
  pageSize: 25,
  paidStatuses: [],
  search: "",
  sortBy: "date" as const,
  sortDirection: "desc" as const,
  tagIds: [],
  types: [],
};

const defaultResult = {
  items: [
    {
      id: "transaction-1",
      notes: "Groceries",
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
};

const renderManager = (result = defaultResult, searchValue = search) => {
  const onClearFilters = vi.fn();
  const onSearchChange = vi.fn();
  list.mockResolvedValue(result);
  render(
    <TransactionManager
      activeOrganizationId="household-1"
      onClearFilters={onClearFilters}
      onSearchChange={onSearchChange}
      role={OWNER_ROLE}
      search={searchValue}
    />,
    { wrapper: Wrapper }
  );
  return { onClearFilters, onSearchChange };
};

beforeEach(() => {
  accountsList.mockResolvedValue([{ id: "account-1", name: "BPI Savings" }]);
  categoriesList.mockResolvedValue([{ id: "category-1", name: "Groceries" }]);
  tagsList.mockResolvedValue([{ id: "tag-1", name: "Vacation" }]);
  archive.mockReset();
  restore.mockReset();
  list.mockReset();
});

describe("TransactionManager", () => {
  it("renders paginated rows and updates URL-backed filters", async () => {
    const user = userEvent.setup();
    const { onSearchChange } = renderManager();

    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "q");

    await waitFor(() =>
      expect(onSearchChange).toHaveBeenLastCalledWith({ search: "q" })
    );
  });

  it("shows a clear empty state for a filtered result", async () => {
    const { onClearFilters } = renderManager(
      {
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 0,
      },
      { ...search, search: "missing" }
    );

    expect(
      await screen.findByText("No matching transactions")
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
