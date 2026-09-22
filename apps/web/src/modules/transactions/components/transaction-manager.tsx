import { hasPermission } from "@masdan/auth/permissions";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Input } from "@masdan/ui/components/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@masdan/ui/components/pagination";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { FilterBar, FilterField } from "@masdan/ui/filters";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import {
  accountsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { categoriesQueryOptions } from "@/modules/categories/queries";
import { tagsQueryOptions } from "@/modules/tags/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions, transactionsQueryOptions } from "../queries";
import type { Transaction } from "../queries";
import type { TransactionSearch } from "../search";
import { TransactionFormDialog } from "./transaction-form";
import { TransactionTable } from "./transaction-table";
import { TransferFormDialog } from "./transfer-form";
import type { Transfer } from "./transfer-form";

interface FilterOption {
  label: string;
  value: string;
}

const toOptions = (
  rows: { id: string; name: string }[] | undefined
): FilterOption[] =>
  rows?.map((row) => ({ label: row.name, value: row.id })) ?? [];

// oxlint-disable-next-line complexity
export const TransactionManager = ({
  activeOrganizationId,
  onClearFilters,
  onSearchChange,
  role,
  search,
}: {
  activeOrganizationId: string;
  onClearFilters: () => void;
  onSearchChange: (
    updates: Partial<TransactionSearch>,
    resetPage?: boolean
  ) => void;
  role: string;
  search: TransactionSearch;
}) => {
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const categories = useQuery(categoriesQueryOptions(activeOrganizationId));
  const tags = useQuery(tagsQueryOptions(activeOrganizationId));
  const transactions = useQuery(
    transactionsQueryOptions(activeOrganizationId, search)
  );
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.transactions.restore({ transactionId: id })
        : client.transactions.archive({ transactionId: id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { restore }) => {
      await invalidateTransactions(queryClient, activeOrganizationId);
      toastManager.add({
        title: restore ? "Transaction restored" : "Transaction archived",
        type: "success",
      });
    },
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (transferId: string) => client.transfers.delete({ transferId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateTransactions(queryClient, activeOrganizationId),
        queryClient.invalidateQueries({ queryKey: ["transaction"] }),
        invalidateAccounts(queryClient, activeOrganizationId),
      ]);
      toastManager.add({ title: "Transfer deleted", type: "success" });
    },
  });

  const updateSearch = onSearchChange;

  const accountOptions = useMemo(
    () => toOptions(accounts.data),
    [accounts.data]
  );
  const categoryOptions = useMemo(
    () => toOptions(categories.data),
    [categories.data]
  );
  const tagOptions = useMemo(() => toOptions(tags.data), [tags.data]);
  const hasFilters =
    search.accountIds.length > 0 ||
    search.categoryIds.length > 0 ||
    search.dateFrom !== undefined ||
    search.dateTo !== undefined ||
    search.includeArchived ||
    search.paidStatuses.length > 0 ||
    search.search.length > 0 ||
    search.sortBy !== "date" ||
    search.sortDirection !== "desc" ||
    search.tagIds.length > 0 ||
    search.types.length > 0 ||
    search.page !== 1 ||
    search.pageSize !== 25;
  const canArchive = hasPermission({
    permissions: { transaction: ["archive"] },
    role,
  });
  const canRestore = hasPermission({
    permissions: { transaction: ["restore"] },
    role,
  });
  const canUpdate = hasPermission({
    permissions: { transaction: ["update"] },
    role,
  });
  const selectedTags = tagOptions.filter((option) =>
    search.tagIds.includes(option.value)
  );
  const totalPages = transactions.data?.totalPages ?? 0;
  const hasRows = (transactions.data?.items.length ?? 0) > 0;

  const listContent = (() => {
    if (transactions.isPending) {
      return <Skeleton className="h-96 w-full" />;
    }
    if (transactions.isError) {
      return (
        <p className="text-muted-foreground">Could not load transactions.</p>
      );
    }
    if (hasRows) {
      return (
        <>
          <TransactionTable
            canArchive={canArchive}
            canRestore={canRestore}
            canUpdate={canUpdate}
            onArchive={(id) => archiveMutation.mutate({ id, restore: false })}
            onDeleteTransfer={(id) => deleteTransferMutation.mutate(id)}
            onEdit={(transaction) => setEditingTransaction(transaction)}
            onEditTransfer={(transfer) => setEditingTransfer(transfer)}
            onRestore={(id) => archiveMutation.mutate({ id, restore: true })}
            onSort={(sortBy) =>
              updateSearch({
                sortBy,
                sortDirection:
                  search.sortBy === sortBy && search.sortDirection === "desc"
                    ? "asc"
                    : "desc",
              })
            }
            sortBy={search.sortBy}
            sortDirection={search.sortDirection}
            transactions={transactions.data.items}
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              {transactions.data.total} transaction
              {transactions.data.total === 1 ? "" : "s"}
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={search.page === 1}
                    href={search.page === 1 ? undefined : "#"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (search.page > 1) {
                        updateSearch({ page: search.page - 1 }, false);
                      }
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="text-muted-foreground px-2 text-sm">
                    Page {search.page} of {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={search.page >= totalPages}
                    href={search.page >= totalPages ? undefined : "#"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (search.page < totalPages) {
                        updateSearch({ page: search.page + 1 }, false);
                      }
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      );
    }

    return (
      <Empty>
        <EmptyTitle>
          {hasFilters ? "No matching transactions" : "No transactions found"}
        </EmptyTitle>
        <EmptyDescription>
          {hasFilters
            ? "Try changing or clearing your filters."
            : "Add income or an expense to start building your household ledger."}
        </EmptyDescription>
      </Empty>
    );
  })();

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex-row items-start justify-between">
              <div>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>
                  Search and review your household income and expenses.
                </CardDescription>
              </div>
              {hasPermission({
                permissions: { transaction: ["create"] },
                role,
              }) ? (
                <div className="flex gap-2">
                  <TransactionFormDialog
                    activeOrganizationId={activeOrganizationId}
                    canCreate
                  />
                  <TransferFormDialog
                    activeOrganizationId={activeOrganizationId}
                    canCreate
                  />
                </div>
              ) : null}
            </div>
            <FilterBar hasFilters={hasFilters} onClear={onClearFilters}>
              <FilterField className="min-w-56" label="Search">
                <Input
                  aria-label="Search transactions"
                  onChange={(event) =>
                    updateSearch({ search: event.target.value })
                  }
                  placeholder="Notes, account, category, or tag"
                  type="search"
                  value={search.search}
                />
              </FilterField>
              <FilterField label="From">
                <DatePicker
                  onValueChange={(value) => updateSearch({ dateFrom: value })}
                  placeholder="Any date"
                  value={search.dateFrom ?? ""}
                />
              </FilterField>
              <FilterField label="To">
                <DatePicker
                  onValueChange={(value) => updateSearch({ dateTo: value })}
                  placeholder="Any date"
                  value={search.dateTo ?? ""}
                />
              </FilterField>
              <FilterField label="Type">
                <Select
                  onValueChange={(value) =>
                    updateSearch({
                      types: value ? [value as "expense" | "income"] : [],
                    })
                  }
                  value={search.types[0] ?? null}
                >
                  <SelectTrigger aria-label="Transaction type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectPopup>
                </Select>
              </FilterField>
              <FilterField label="Status">
                <Select
                  onValueChange={(value) =>
                    updateSearch({
                      paidStatuses: value ? [value as "paid" | "unpaid"] : [],
                    })
                  }
                  value={search.paidStatuses[0] ?? null}
                >
                  <SelectTrigger aria-label="Paid status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectPopup>
                </Select>
              </FilterField>
              <FilterField label="Account">
                <Select
                  onValueChange={(value) =>
                    updateSearch({ accountIds: value ? [value] : [] })
                  }
                  value={search.accountIds[0] ?? null}
                >
                  <SelectTrigger aria-label="Transaction account">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectPopup>
                    {accountOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </FilterField>
              <FilterField label="Category">
                <Select
                  onValueChange={(value) =>
                    updateSearch({ categoryIds: value ? [value] : [] })
                  }
                  value={search.categoryIds[0] ?? null}
                >
                  <SelectTrigger aria-label="Transaction category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectPopup>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </FilterField>
              <FilterField className="min-w-56" label="Tags">
                <Combobox
                  items={tagOptions}
                  multiple
                  onValueChange={(values) =>
                    updateSearch({
                      tagIds: (values as FilterOption[]).map(
                        (value) => value.value
                      ),
                    })
                  }
                  value={selectedTags}
                >
                  <ComboboxChips aria-label="Transaction tags">
                    {selectedTags.map((tag) => (
                      <ComboboxChip key={tag.value}>{tag.label}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput placeholder="All tags" />
                  </ComboboxChips>
                  <ComboboxPopup>
                    <ComboboxEmpty>No matching tag.</ComboboxEmpty>
                    <ComboboxList>
                      <ComboboxCollection>
                        {(item: FilterOption) => (
                          <ComboboxItem key={item.value} value={item}>
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxList>
                  </ComboboxPopup>
                </Combobox>
              </FilterField>
              <FilterField label="Page size">
                <Select
                  onValueChange={(value) =>
                    updateSearch({ pageSize: Number(value) })
                  }
                  value={String(search.pageSize)}
                >
                  <SelectTrigger aria-label="Page size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {[25, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} rows
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </FilterField>
              <Button
                onClick={() =>
                  updateSearch({ includeArchived: !search.includeArchived })
                }
                size="sm"
                type="button"
                variant={search.includeArchived ? "outline" : "ghost"}
              >
                {search.includeArchived ? "Hide archived" : "Show archived"}
              </Button>
            </FilterBar>
          </div>
        </CardHeader>
        <CardPanel>{listContent}</CardPanel>
      </Card>
      {editingTransaction ? (
        <TransactionFormDialog
          activeOrganizationId={activeOrganizationId}
          canUpdate={canUpdate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingTransaction(null);
            }
          }}
          open
          transaction={editingTransaction}
        />
      ) : null}
      {editingTransfer ? (
        <TransferFormDialog
          activeOrganizationId={activeOrganizationId}
          canUpdate={canUpdate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingTransfer(null);
            }
          }}
          open
          transfer={editingTransfer}
        />
      ) : null}
    </>
  );
};
