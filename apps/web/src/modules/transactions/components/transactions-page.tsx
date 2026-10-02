import {
  FileImportIcon,
  Invoice02Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { ColorDot, IconTile } from "@masdan/ui/components/icon-tile";
import {
  Page,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useMediaQuery } from "@masdan/ui/hooks/use-media-query";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import { useAppActions } from "@/components/app-actions";
import { Amount } from "@/components/finance/amount";
import {
  Stat,
  StatDetail,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { NewMenu } from "@/components/shell/new-menu";
import type { Household } from "@/hooks/use-household";
import { householdToday } from "@/lib/household-date";
import { AccountCardThumb } from "@/modules/accounts/components/account-card";
import { AccountTile } from "@/modules/accounts/components/account-row";
import {
  ledgerInfiniteQuery,
  ledgerQueries,
} from "@/modules/transactions/queries";

import type { TransactionSearch } from "../search";
import type { Transaction } from "../types";
import { useLedgerActions } from "../use-ledger-actions";
import { useLedgerSelection } from "../use-ledger-selection";
import { BulkActionBar } from "./bulk-action-bar";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { Ledger } from "./ledger";
import { LedgerFilters, LedgerSearch } from "./ledger-filters";

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
  const totals = useQuery({
    ...ledgerQueries(activeOrganizationId, search).totals,
    placeholderData: keepPreviousData,
  });

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
    <>
      <section
        aria-label="Totals for these transactions"
        className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl px-4 py-3.5 md:hidden dark:ring-1"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-xs">Net</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {totals.data.count.toLocaleString()}{" "}
            {totals.data.count === 1 ? "transaction" : "transactions"}
          </span>
        </div>
        <span className="-mt-2 truncate text-2xl font-semibold tabular-nums">
          <Amount currency={code} sign="auto" value={income - expense} />
        </span>
        <div className="border-hairline grid grid-cols-2 gap-3 border-t pt-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Money in</span>
            <span className="truncate text-sm font-semibold tabular-nums">
              <Amount
                currency={code}
                sign={income > 0 ? "in" : "none"}
                tone="auto"
                value={income}
              />
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Money out</span>
            <span className="truncate text-sm font-semibold tabular-nums">
              <Amount
                currency={code}
                sign={expense > 0 ? "out" : "none"}
                value={expense}
              />
            </span>
          </div>
        </div>
        {others.length > 0 ? (
          <p className="text-muted-foreground truncate text-xs">
            Plus activity in{" "}
            {others.map((entry) => entry.currencyCode).join(", ")}
          </p>
        ) : null}
      </section>
      <StatGroup
        aria-label="Totals for these transactions"
        className="max-md:hidden"
      >
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
    </>
  );
};

// Loading, error, filtered-empty, first-run and populated states of one list.
// oxlint-disable-next-line complexity
export const TransactionsPage = ({
  household,
  onClearFilters,
  onSearchChange,
  restoredFilters = false,
  search,
  selectedId,
}: {
  household: Household & { activeOrganizationId: string };
  onClearFilters: () => void;
  onSearchChange: (updates: Partial<TransactionSearch>) => void;
  /** The filters came from the last visit, not from the link. */
  restoredFilters?: boolean;
  search: TransactionSearch;
  selectedId?: string;
}) => {
  const { activeOrganizationId, can, timezone } = household;
  const canBulkEdit = can({ transaction: ["update"] });
  const navigate = useNavigate();
  const { compose, quickReview } = useAppActions();
  const ledgerActions = useLedgerActions(activeOrganizationId);
  const queries = ledgerQueries(activeOrganizationId, search);
  const accounts = useQuery(queries.accounts);
  const categories = useQuery(queries.categories);
  const tags = useQuery(queries.tags);
  const transactions = useInfiniteQuery(
    ledgerInfiniteQuery(activeOrganizationId, search)
  );
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = transactions;
  const loadMore = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !hasNextPage || isFetchingNextPage || isFetchNextPageError) {
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            fetchNextPage();
          }
        },
        { rootMargin: "400px" }
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]
  );
  const today = householdToday(timezone);
  const { clearSelection, selectedIds, toggleAll, toggleSelection } =
    useLedgerSelection(search);
  const [bulkOpen, setBulkOpen] = useState(false);
  const wide = useMediaQuery({ min: 768 });
  // Phones select through an explicit mode: a checkbox on every row crowds
  // out the transaction itself.
  const [selecting, setSelecting] = useState(false);
  const showSelection = canBulkEdit && (wide || selecting);
  const stopSelecting = () => {
    setSelecting(false);
    clearSelection();
  };

  const accountOptions = useMemo(
    () =>
      (accounts.data ?? []).map((account) => ({
        label: account.archivedAt ? `${account.name} (archived)` : account.name,
        leading:
          account.accountType === "credit_card" ? (
            <AccountCardThumb account={account} size="xs" />
          ) : (
            <AccountTile account={account} size="xs" />
          ),
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
    () =>
      (tags.data ?? []).map((tag) => ({
        label: tag.name,
        leading: <ColorDot className="size-2.5" tint={tag.color} />,
        value: tag.id,
      })),
    [tags.data]
  );

  const hasFilters =
    search.accountIds.length > 0 ||
    search.categoryIds.length > 0 ||
    search.dateFrom !== undefined ||
    search.dateTo !== undefined ||
    search.includeArchived ||
    search.includeInterest ||
    search.paidStatuses.length > 0 ||
    search.search.length > 0 ||
    search.tagIds.length > 0 ||
    search.types.length > 0;

  // Restored filters can name things deleted since: drop them rather than
  // show an empty ledger the filter chips cannot explain.
  useEffect(() => {
    if (!restoredFilters || !accounts.data || !categories.data || !tags.data) {
      return;
    }
    const known = (ids: string[], options: { id: string }[]) =>
      ids.filter((id) => options.some((option) => option.id === id));
    const accountIds = known(search.accountIds, accounts.data);
    const categoryIds = known(search.categoryIds, categories.data);
    const tagIds = known(search.tagIds, tags.data);
    if (
      accountIds.length !== search.accountIds.length ||
      categoryIds.length !== search.categoryIds.length ||
      tagIds.length !== search.tagIds.length
    ) {
      onSearchChange({ accountIds, categoryIds, tagIds });
    }
  }, [
    accounts.data,
    categories.data,
    onSearchChange,
    restoredFilters,
    search.accountIds,
    search.categoryIds,
    search.tagIds,
    tags.data,
  ]);

  // A link (from chat) carries a line of text. It is read into the form once,
  // and never creates: following a link is not a create intent.
  const linkedText = search.quickEntry;
  const readLinkedText = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedText || readLinkedText.current === linkedText) {
      return;
    }
    readLinkedText.current = linkedText;
    if (can({ transaction: ["create"] })) {
      quickReview(linkedText);
    }
    onSearchChange({ quickEntry: undefined });
  }, [can, linkedText, onSearchChange, quickReview]);

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

  const pages = transactions.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const groups: { month: string; items: Transaction[] }[] = [];
  if (search.sortBy === "date") {
    for (const page of pages) {
      for (const group of page.groups) {
        const last = groups.at(-1);
        if (last?.month === group.month) {
          last.items.push(...group.items);
        } else {
          groups.push({ items: [...group.items], month: group.month });
        }
      }
    }
  }
  const total = pages[0]?.total ?? 0;

  let content: React.ReactNode;
  if (transactions.isPending) {
    content = <LedgerSkeleton />;
  } else if (transactions.isError && pages.length === 0) {
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
  } else if (items.length > 0) {
    content = (
      <div>
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
          groups={search.sortBy === "date" ? groups : undefined}
          onOpen={(transaction) => openTransaction(transaction)}
          scoped={search.accountIds.length > 0}
          selection={
            showSelection
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
          transactions={items}
        />
        <div className="flex flex-col items-center gap-3 py-5" ref={loadMore}>
          <p className="text-muted-foreground text-xs tabular-nums">
            Showing {items.length.toLocaleString()} of {total.toLocaleString()}
          </p>
          {transactions.isFetchingNextPage ? <LedgerSkeleton /> : null}
          {transactions.isFetchNextPageError ? (
            <Button onClick={() => fetchNextPage()} variant="secondary">
              Couldn’t load more · Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  } else if (hasFilters) {
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
      <PageHeader className="max-md:flex-nowrap max-md:items-center">
        <PageHeading>
          <PageTitle>Transactions</PageTitle>
        </PageHeading>
        <div className="flex items-center gap-1 md:hidden">
          {can({ transaction: ["create"] }) && !selecting ? (
            <Button
              aria-label="Import"
              render={<Link to="/imports" />}
              size="icon"
              variant="ghost"
            >
              <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
            </Button>
          ) : null}
          {canBulkEdit && items.length > 0 ? (
            <Button
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              size="sm"
              variant={selecting ? "default" : "secondary"}
            >
              {selecting ? "Done" : "Select"}
            </Button>
          ) : null}
        </div>
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

      <TotalsStrip
        activeOrganizationId={activeOrganizationId}
        currency={household.currency ?? "PHP"}
        search={search}
      />

      <section
        aria-label="Ledger"
        data-sticky
        className={
          canBulkEdit
            ? "group/ledger flex flex-col gap-3 pb-24 md:pb-12"
            : "group/ledger flex flex-col gap-3"
        }
      >
        <div className="md:bg-background/95 md:border-hairline md:supports-[backdrop-filter]:bg-background/85 flex flex-col gap-2 md:sticky md:top-0 md:z-20 md:rounded-xl md:border md:px-3 md:py-3 md:shadow-sm md:supports-[backdrop-filter]:backdrop-blur-md">
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
        </div>
        {restoredFilters && hasFilters ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            Showing the filters you used last time.
            <Button onClick={onClearFilters} size="xs" variant="ghost">
              Reset
            </Button>
          </p>
        ) : null}
        {content}
      </section>
      {canBulkEdit ? (
        <>
          <BulkActionBar
            count={selectedIds.size}
            onClear={wide ? clearSelection : stopSelecting}
            onEdit={() => setBulkOpen(true)}
          />
          <BulkEditDialog
            activeOrganizationId={activeOrganizationId}
            categories={categories.data ?? []}
            tags={tags.data ?? []}
            transactionIds={[...selectedIds]}
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onSaved={wide ? clearSelection : stopSelecting}
          />
        </>
      ) : null}
    </Page>
  );
};
