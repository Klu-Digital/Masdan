import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FileImportIcon,
  Invoice02Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Amount } from "@masdan/ui/components/amount";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  Page,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Stat,
  StatDetail,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type React from "react";

import { useAppActions } from "@/components/app-actions";
import { NewMenu } from "@/components/shell/new-menu";
import type { Household } from "@/hooks/use-household";
import { householdToday } from "@/lib/household-date";
import { accountsQueryOptions } from "@/modules/accounts/queries";
import { categoriesQueryOptions } from "@/modules/categories/queries";
import { tagsQueryOptions } from "@/modules/tags/queries";

import {
  transactionTotalsQueryOptions,
  transactionsQueryOptions,
} from "../queries";
import type { Transaction } from "../queries";
import type { TransactionSearch } from "../search";
import { useLedgerActions } from "../use-ledger-actions";
import { useLedgerSelection } from "../use-ledger-selection";
import { BulkActionBar } from "./bulk-action-bar";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { Ledger } from "./ledger";
import { LedgerFilters, LedgerSearch } from "./ledger-filters";
import { QuickEntry } from "./quick-entry";

const PAGE_SIZES = [25, 50, 100];

const LedgerSkeleton = () => (
  <div aria-hidden="true" className="flex flex-col gap-1 pt-4">
    {Array.from({ length: 8 }, (_, index) => (
      <div className="flex items-center gap-3 px-2 py-2.5" key={index}>
        <Skeleton className="size-9" radius="lg" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
    ))}
  </div>
);

const TotalsStrip = ({
  activeOrganizationId,
  currency,
  search,
}: {
  activeOrganizationId: string;
  currency: string;
  search: TransactionSearch;
}) => {
  const input = {
    accountIds: search.accountIds,
    categoryIds: search.categoryIds,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    includeArchived: search.includeArchived,
    paidStatuses: search.paidStatuses,
    search: search.search,
    tagIds: search.tagIds,
    types: search.types,
  };
  const totals = useQuery(
    transactionTotalsQueryOptions(activeOrganizationId, input)
  );

  if (totals.isPending) {
    return <Skeleton className="h-19 w-full" radius="2xl" />;
  }
  if (!totals.data) {
    return null;
  }
  const primary =
    totals.data.currencies.find((entry) => entry.currencyCode === currency) ??
    totals.data.currencies[0];
  const others = totals.data.currencies.filter((entry) => entry !== primary);
  const code = primary?.currencyCode ?? currency;
  const income = Number(primary?.income ?? 0);
  const expense = Number(primary?.expense ?? 0);

  return (
    <StatGroup aria-label="Totals for these transactions">
      <Stat>
        <StatLabel>Money in</StatLabel>
        <StatValue>
          <Amount
            currency={code}
            sign={income > 0 ? "in" : "none"}
            tone="auto"
            value={income}
          />
        </StatValue>
      </Stat>
      <Stat>
        <StatLabel>Money out</StatLabel>
        <StatValue>
          <Amount
            currency={code}
            sign={expense > 0 ? "out" : "none"}
            value={expense}
          />
        </StatValue>
      </Stat>
      <Stat>
        <StatLabel>Net</StatLabel>
        <StatValue>
          <Amount currency={code} sign="auto" value={income - expense} />
        </StatValue>
        {others.length > 0 ? (
          <StatDetail>
            Plus activity in{" "}
            {others.map((entry) => entry.currencyCode).join(", ")}
          </StatDetail>
        ) : null}
      </Stat>
      <Stat>
        <StatLabel>Transactions</StatLabel>
        <StatValue>{totals.data.count.toLocaleString()}</StatValue>
      </Stat>
    </StatGroup>
  );
};

// Loading, error, filtered-empty, first-run and populated states of one list.
// oxlint-disable-next-line complexity
export const TransactionsPage = ({
  household,
  onClearFilters,
  onSearchChange,
  search,
  selectedId,
}: {
  household: Household & { activeOrganizationId: string };
  onClearFilters: () => void;
  onSearchChange: (
    updates: Partial<TransactionSearch>,
    resetPage?: boolean
  ) => void;
  search: TransactionSearch;
  selectedId?: string;
}) => {
  const { activeOrganizationId, can, timezone } = household;
  const canBulkEdit = can({ transaction: ["update"] });
  const navigate = useNavigate();
  const { compose } = useAppActions();
  const ledgerActions = useLedgerActions(activeOrganizationId);
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const categories = useQuery(categoriesQueryOptions(activeOrganizationId));
  const tags = useQuery(tagsQueryOptions(activeOrganizationId));
  const transactions = useQuery(
    transactionsQueryOptions(activeOrganizationId, search)
  );
  const today = householdToday(timezone);
  const { clearSelection, selectedIds, toggleAll, toggleSelection } =
    useLedgerSelection(search);
  const [bulkOpen, setBulkOpen] = useState(false);

  const accountOptions = useMemo(
    () =>
      (accounts.data ?? []).map((account) => ({
        label: account.archivedAt ? `${account.name} (archived)` : account.name,
        value: account.id,
      })),
    [accounts.data]
  );
  const categoryOptions = useMemo(
    () =>
      (categories.data ?? []).map((category) => ({
        label: category.name,
        leading: (
          <IconTile size="xs" tint={category.color}>
            {category.icon}
          </IconTile>
        ),
        value: category.id,
      })),
    [categories.data]
  );
  const tagOptions = useMemo(
    () => (tags.data ?? []).map((tag) => ({ label: tag.name, value: tag.id })),
    [tags.data]
  );

  const hasFilters =
    search.accountIds.length > 0 ||
    search.categoryIds.length > 0 ||
    search.dateFrom !== undefined ||
    search.dateTo !== undefined ||
    search.includeArchived ||
    search.paidStatuses.length > 0 ||
    search.search.length > 0 ||
    search.tagIds.length > 0 ||
    search.types.length > 0;

  const clearLinkedText = useCallback(
    () => onSearchChange({ quickEntry: undefined }, false),
    [onSearchChange]
  );

  const openTransaction = (transaction: Transaction) =>
    navigate({
      params: { transactionId: transaction.id },
      search: (previous) => previous,
      to: "/transactions/$transactionId",
    });

  const editTransaction = (transaction: Transaction) => {
    if (transaction.transfer) {
      compose({ transfer: transaction.transfer, type: "transfer" });
      return;
    }
    compose({ transaction, type: "transaction" });
  };

  const { data } = transactions;
  const totalPages = data?.totalPages ?? 0;
  const firstRow = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? firstRow + data.items.length - 1 : 0;

  let content: React.ReactNode;
  if (transactions.isPending) {
    content = <LedgerSkeleton />;
  } else if (transactions.isError) {
    content = (
      <Empty>
        <EmptyTitle>Couldn’t load transactions</EmptyTitle>
        <EmptyDescription>
          Check your connection and try again.
        </EmptyDescription>
        <Button onClick={() => transactions.refetch()} variant="secondary">
          Try again
        </Button>
      </Empty>
    );
  } else if (data && data.items.length > 0) {
    content = (
      <div
        className={
          transactions.isPlaceholderData
            ? "opacity-60 transition-opacity"
            : "transition-opacity"
        }
      >
        <Ledger
          actions={{
            handleEdit: (transaction) => editTransaction(transaction),
            ledger: ledgerActions,
            permissions: {
              canArchive: can({ transaction: ["archive"] }),
              canRestore: can({ transaction: ["restore"] }),
              canUpdate: canBulkEdit,
            },
          }}
          grouped={search.sortBy === "date"}
          onOpen={(transaction) => openTransaction(transaction)}
          scoped={search.accountIds.length > 0}
          selection={
            canBulkEdit
              ? {
                  onToggle: toggleSelection,
                  onToggleAll: toggleAll,
                  selectedIds,
                }
              : undefined
          }
          selectedId={selectedId}
          sort={{
            by: search.sortBy,
            direction: search.sortDirection,
            onSort: (sortBy) =>
              onSearchChange({
                sortBy,
                sortDirection:
                  search.sortBy === sortBy && search.sortDirection === "desc"
                    ? "asc"
                    : "desc",
              }),
          }}
          today={today}
          transactions={data.items}
        />
        <nav
          aria-label="Pages"
          className="flex flex-wrap items-center justify-between gap-3 pt-5"
        >
          <p className="text-muted-foreground text-xs tabular-nums">
            {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of{" "}
            {data.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value) =>
                onSearchChange({ pageSize: Number(value) })
              }
              value={String(search.pageSize)}
            >
              <SelectTrigger
                aria-label="Rows per page"
                className="w-auto min-w-0"
                size="sm"
              >
                <SelectValue>{`${search.pageSize} per page`}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <Button
              aria-label="Previous page"
              disabled={search.page <= 1}
              onClick={() => onSearchChange({ page: search.page - 1 }, false)}
              size="icon-sm"
              variant="secondary"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {search.page} / {Math.max(totalPages, 1)}
            </span>
            <Button
              aria-label="Next page"
              disabled={search.page >= totalPages}
              onClick={() => onSearchChange({ page: search.page + 1 }, false)}
              size="icon-sm"
              variant="secondary"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          </div>
        </nav>
      </div>
    );
  } else if (hasFilters || search.page > 1) {
    content = (
      <Empty>
        <EmptyMedia>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>No matching transactions</EmptyTitle>
        <EmptyDescription>
          Try a wider date range or fewer filters.
        </EmptyDescription>
        <EmptyContent>
          <Button onClick={onClearFilters} variant="secondary">
            Clear filters
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <Empty>
        <EmptyMedia>
          <HugeiconsIcon icon={Invoice02Icon} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>Your ledger is empty</EmptyTitle>
        <EmptyDescription>
          Record income, spending and transfers here. Every entry updates its
          account’s balance.
        </EmptyDescription>
        {can({ transaction: ["create"] }) ? (
          <EmptyContent>
            <Button
              onClick={() => compose({ kind: "expense", type: "transaction" })}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Add your first expense
            </Button>
            <Button render={<Link to="/imports" />} variant="secondary">
              <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
              Import from CSV
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Transactions</PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          {can({ transaction: ["create"] }) ? (
            <Button render={<Link to="/imports" />} variant="secondary">
              <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
              Import
            </Button>
          ) : null}
          <NewMenu
            trigger={
              <Button>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                New
              </Button>
            }
          />
        </PageActions>
      </PageHeader>

      {can({ transaction: ["create"] }) ? (
        <QuickEntry
          activeOrganizationId={activeOrganizationId}
          canArchive={can({ transaction: ["archive"] })}
          linkedText={search.quickEntry}
          onLinkedTextRead={clearLinkedText}
        />
      ) : null}

      <TotalsStrip
        activeOrganizationId={activeOrganizationId}
        currency={household.currency ?? "PHP"}
        search={search}
      />

      <section
        aria-label="Ledger"
        className={
          canBulkEdit
            ? "flex flex-col gap-3 pb-24 md:pb-12"
            : "flex flex-col gap-3"
        }
      >
        <LedgerSearch
          onChange={(value) => onSearchChange({ search: value })}
          value={search.search}
        />
        <LedgerFilters
          accountOptions={accountOptions}
          categoryOptions={categoryOptions}
          hasFilters={hasFilters}
          onClear={onClearFilters}
          onSearchChange={onSearchChange}
          search={search}
          tagOptions={tagOptions}
          today={today}
        />
        {content}
      </section>
      {canBulkEdit ? (
        <>
          <BulkActionBar
            count={selectedIds.size}
            onClear={clearSelection}
            onEdit={() => setBulkOpen(true)}
          />
          <BulkEditDialog
            activeOrganizationId={activeOrganizationId}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
            transactionIds={[...selectedIds]}
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onSaved={clearSelection}
          />
        </>
      ) : null}
    </Page>
  );
};
