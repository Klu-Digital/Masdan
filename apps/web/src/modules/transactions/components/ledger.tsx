import { Badge } from "@masdan/ui/components/badge";
import { Checkbox } from "@masdan/ui/components/checkbox";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import {
  ListItemButton,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { useMediaQuery } from "@masdan/ui/hooks/use-media-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import { Amount } from "@/components/finance/amount";
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridColumnHeader,
  DataGridGroupRow,
  DataGridHeader,
  DataGridRow,
} from "@/components/finance/data-grid";
import { formatDay, formatMonthYear, formatShortDate } from "@/lib/dates";

import { describeTransaction } from "../presentation";
import type { TransactionView } from "../presentation";
import type { TransactionSortBy, TransactionSortDirection } from "../search";
import type { Transaction } from "../types";
import type { LedgerActions } from "../use-ledger-actions";
import { TransactionMenu } from "./transaction-menu";
import type { LedgerPermissions } from "./transaction-menu";
import { TransactionTile } from "./transaction-tile";

const MAX_INLINE_TAGS = 2;
const selectable = (transaction: Transaction) =>
  transaction.transferId === null &&
  !transaction.reconciliationSnapshotId &&
  transaction.archivedAt === null;

const disabledReason = (transaction: Transaction) => {
  if (selectable(transaction)) {
    return;
  }
  return transaction.transferId
    ? "Transfers cannot be bulk edited"
    : "Archived transactions cannot be bulk edited";
};

const SelectAllCheckbox = ({
  transactions,
  selection,
}: {
  transactions: Transaction[];
  selection: NonNullable<LedgerProps["selection"]>;
}) => {
  const ids = transactions.filter(selectable).map(({ id }) => id);
  const selected = ids.filter((id) => selection.selectedIds.has(id)).length;
  return (
    <DataGridColumnHeader>
      <Checkbox
        aria-label="Select all loaded transactions"
        checked={selected > 0 && selected === ids.length}
        indeterminate={selected > 0 && selected < ids.length}
        disabled={ids.length === 0}
        onCheckedChange={() => selection.onToggleAll(ids)}
      />
    </DataGridColumnHeader>
  );
};

const RowCheckbox = ({
  transaction,
  selection,
  label,
}: {
  transaction: Transaction;
  selection: NonNullable<LedgerProps["selection"]>;
  label: string;
}) => (
  <Checkbox
    aria-label={`Select ${label}`}
    checked={selection.selectedIds.has(transaction.id)}
    disabled={!selectable(transaction)}
    onCheckedChange={() => selection.onToggle(transaction.id)}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    title={disabledReason(transaction)}
  />
);

export interface LedgerProps {
  actions?: {
    ledger: LedgerActions;
    handleEdit: (transaction: Transaction) => void;
    permissions: LedgerPermissions;
  };
  /** Month groups returned by the ledger API when sorted by date. */
  groups?: { month: string; items: Transaction[] }[];
  /** Hide the account column when the ledger is already one account's. */
  hideAccount?: boolean;
  onOpen: (transaction: Transaction) => void;
  /** The list is filtered to accounts, so transfer postings show direction. */
  scoped?: boolean;
  selection?: {
    selectedIds: ReadonlySet<string>;
    onToggle: (id: string) => void;
    onToggleAll: (ids: string[]) => void;
  };
  selectedId?: string;
  sort?: {
    by: TransactionSortBy;
    direction: TransactionSortDirection;
    onSort: (by: TransactionSortBy) => void;
  };
  today: string;
  transactions: Transaction[];
}

const StatusBadges = ({ transaction }: { transaction: Transaction }) => (
  <>
    {transaction.transfer === null && transaction.paidStatus === "unpaid" ? (
      <Badge variant="warning">Unpaid</Badge>
    ) : null}
    {transaction.splits.length > 0 ? <Badge>Split</Badge> : null}
    {transaction.archivedAt === null ? null : (
      <Badge variant="outline">Archived</Badge>
    )}
  </>
);

const TagChips = ({ tags }: { tags: Transaction["tags"] }) => {
  if (tags.length === 0) {
    return null;
  }
  const shown = tags.slice(0, MAX_INLINE_TAGS);
  return (
    <span className="text-muted-foreground hidden items-center gap-2 text-xs lg:inline-flex">
      {shown.map((tag) => (
        <span className="inline-flex items-center gap-1" key={tag.id}>
          <ColorDot tint={tag.color} />
          {tag.name}
        </span>
      ))}
      {tags.length > MAX_INLINE_TAGS ? (
        <span>+{tags.length - MAX_INLINE_TAGS}</span>
      ) : null}
    </span>
  );
};

const amountTone = (
  transaction: Transaction,
  view: TransactionView
): "default" | "muted" | "positive" => {
  if (transaction.archivedAt !== null) {
    return "muted";
  }
  return view.direction === "in" ? "positive" : "default";
};

const rowLabel = (transaction: Transaction, title: string, today: string) =>
  `${title}, ${formatDay(transaction.transactionDate, today)}`;

const openOnKey =
  (open: () => void) => (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

type LedgerEntry =
  | { kind: "group"; month: string }
  | { kind: "item"; transaction: Transaction };

const OVERSCAN = 12;
const ESTIMATED_ITEM_HEIGHT = { desktop: 57, mobile: 72 };
const ESTIMATED_GROUP_HEIGHT = { desktop: 44, mobile: 40 };

const flattenEntries = (
  groups: LedgerProps["groups"],
  transactions: Transaction[]
): LedgerEntry[] => {
  if (!groups) {
    return transactions.map((transaction) => ({ kind: "item", transaction }));
  }
  return groups.flatMap((group) => [
    { kind: "group" as const, month: group.month },
    ...group.items.map((transaction) => ({
      kind: "item" as const,
      transaction,
    })),
  ]);
};

/**
 * Windows the ledger against the app shell's scroll container. The rows that are mounted keep
 * their normal flow (so sticky headers and table semantics still work) and
 * spacers stand in for the ones that are not. The month band above the
 * viewport stays mounted so it can keep sticking.
 */
const useVirtualLedger = <T extends HTMLElement>(
  entries: LedgerEntry[],
  variant: "desktop" | "mobile"
) => {
  const listRef = useRef<T>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const groupIndexes = useMemo(
    () =>
      entries.flatMap((entry, index) =>
        entry.kind === "group" ? [index] : []
      ),
    [entries]
  );

  // The app shell scrolls `main`, not the window, so the virtualizer has to
  // watch that element and measure the list's offset within it.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const node = listRef.current;
    const root = node?.closest<HTMLElement>("#main") ?? null;
    setScroller(root);
    if (!node || !root) {
      return;
    }
    const measure = () =>
      setScrollMargin(
        node.getBoundingClientRect().top -
          root.getBoundingClientRect().top +
          root.scrollTop
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (root.firstElementChild) {
      observer.observe(root.firstElementChild);
    }
    return () => observer.disconnect();
  }, []);

  // oxlint-disable-next-line react/incompatible-library -- rows read straight from the virtualizer each render
  const virtualizer = useVirtualizer({
    count: entries.length,
    estimateSize: (index) =>
      entries[index]?.kind === "group"
        ? ESTIMATED_GROUP_HEIGHT[variant]
        : ESTIMATED_ITEM_HEIGHT[variant],
    getItemKey: (index) => {
      const entry = entries[index];
      return entry?.kind === "group"
        ? `group:${entry.month}`
        : (entry?.transaction.id ?? index);
    },
    getScrollElement: () => scroller,
    // Until the scroll container is found (and where there is none, as in
    // jsdom) assume a viewport-sized window so the first rows still render.
    initialRect: { height: window.innerHeight, width: window.innerWidth },
    overscan: OVERSCAN,
    rangeExtractor: (range) => {
      const rendered = defaultRangeExtractor(range);
      const pinned = groupIndexes.findLast(
        (index) => index <= range.startIndex
      );
      return pinned === undefined || rendered.includes(pinned)
        ? rendered
        : [pinned, ...rendered];
    },
    scrollMargin,
  });

  return { listRef, scrollMargin, virtualizer };
};

/** Interleaves the mounted rows with spacers for the gaps between them. */
const withSpacers = (
  items: VirtualItem[],
  scrollMargin: number,
  totalSize: number
) => {
  const out: ({ height: number; spacer: true; key: string } | VirtualItem)[] =
    [];
  let cursor = 0;
  for (const item of items) {
    const start = item.start - scrollMargin;
    if (start > cursor) {
      out.push({
        height: start - cursor,
        key: `spacer:${item.index}`,
        spacer: true,
      });
    }
    out.push(item);
    cursor = item.end - scrollMargin;
  }
  const tail = totalSize - cursor;
  if (tail > 0) {
    out.push({ height: tail, key: "spacer:end", spacer: true });
  }
  return out;
};

const Spacer = ({ height }: { height: number }) => (
  <div
    aria-hidden="true"
    className="h-(--spacer-height)"
    style={{ "--spacer-height": `${height}px` } as React.CSSProperties}
  />
);

const DesktopHeader = ({
  actions,
  hideAccount,
  selection,
  sort,
  transactions,
}: LedgerProps) => (
  <DataGridHeader>
    <DataGridRow>
      {selection ? (
        <SelectAllCheckbox selection={selection} transactions={transactions} />
      ) : null}
      <DataGridColumnHeader
        direction={sort?.by === "date" ? sort.direction : undefined}
        onSort={sort ? () => sort.onSort("date") : undefined}
      >
        Date
      </DataGridColumnHeader>
      <DataGridColumnHeader>Transaction</DataGridColumnHeader>
      {hideAccount ? null : (
        <DataGridColumnHeader className="hidden lg:table-cell">
          Account
        </DataGridColumnHeader>
      )}
      <DataGridColumnHeader
        align="end"
        direction={sort?.by === "amount" ? sort.direction : undefined}
        onSort={sort ? () => sort.onSort("amount") : undefined}
      >
        Amount
      </DataGridColumnHeader>
      {actions ? (
        <DataGridColumnHeader>
          <span className="sr-only">Actions</span>
        </DataGridColumnHeader>
      ) : null}
    </DataGridRow>
  </DataGridHeader>
);

const DesktopLedger = (props: LedgerProps) => {
  const {
    actions,
    groups,
    hideAccount,
    onOpen,
    scoped,
    selection,
    selectedId,
    today,
    transactions,
  } = props;
  const columnCount =
    3 + (hideAccount ? 0 : 1) + (actions ? 1 : 0) + (selection ? 1 : 0);
  const entries = useMemo(
    () => flattenEntries(groups, transactions),
    [groups, transactions]
  );
  const { listRef, scrollMargin, virtualizer } =
    useVirtualLedger<HTMLTableSectionElement>(entries, "desktop");
  const row = (transaction: Transaction, virtualItem: VirtualItem) => {
    const view = describeTransaction(transaction, { scoped });
    const open = () => onOpen(transaction);
    return (
      <DataGridRow
        aria-label={rowLabel(transaction, view.title, today)}
        data-selected={selectedId === transaction.id || undefined}
        data-index={virtualItem.index}
        key={virtualItem.key}
        onClick={open}
        onKeyDown={openOnKey(open)}
        ref={virtualizer.measureElement}
        tabIndex={0}
      >
        {selection ? (
          <DataGridCell className="w-10">
            <RowCheckbox
              transaction={transaction}
              selection={selection}
              label={rowLabel(transaction, view.title, today)}
            />
          </DataGridCell>
        ) : null}
        <DataGridCell className="text-muted-foreground w-28 whitespace-nowrap tabular-nums">
          {formatShortDate(transaction.transactionDate, today)}
        </DataGridCell>
        <DataGridCell>
          <div className="flex min-w-0 items-center gap-3">
            <TransactionTile transaction={transaction} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{view.title}</span>
                <StatusBadges transaction={transaction} />
              </span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-3 text-xs">
                <span className="truncate">
                  {hideAccount || transaction.transfer
                    ? view.subtitle
                    : (transaction.categoryName ?? view.subtitle)}
                </span>
                <TagChips tags={transaction.tags} />
              </span>
            </div>
          </div>
        </DataGridCell>
        {hideAccount ? null : (
          <DataGridCell className="text-muted-foreground hidden w-48 truncate lg:table-cell">
            {transaction.accountName ?? "No account"}
          </DataGridCell>
        )}
        <DataGridCell className="w-40 text-right">
          <Amount
            weight="medium"
            currency={transaction.currencyCode}
            sign={view.sign}
            tone={amountTone(transaction, view)}
            value={transaction.amount}
          />
        </DataGridCell>
        {actions ? (
          <DataGridCell className="w-12 text-right">
            <span className="opacity-100 transition-opacity group-focus-within/grid-row:opacity-100 group-hover/grid-row:opacity-100 pointer-fine:opacity-0">
              <TransactionMenu
                actions={actions.ledger}
                onEdit={actions.handleEdit}
                permissions={actions.permissions}
                transaction={transaction}
              />
            </span>
          </DataGridCell>
        ) : null}
      </DataGridRow>
    );
  };

  return (
    <DataGrid>
      <DesktopHeader {...props} />
      <DataGridBody ref={listRef}>
        {withSpacers(
          virtualizer.getVirtualItems(),
          scrollMargin,
          virtualizer.getTotalSize()
        ).map((item) => {
          if ("spacer" in item) {
            return (
              <tr aria-hidden="true" key={item.key}>
                <td colSpan={columnCount}>
                  <Spacer height={item.height} />
                </td>
              </tr>
            );
          }
          const entry = entries[item.index];
          if (!entry) {
            return null;
          }
          return entry.kind === "group" ? (
            <DataGridGroupRow
              colSpan={columnCount}
              data-index={item.index}
              key={item.key}
              ref={virtualizer.measureElement}
            >
              {formatMonthYear(entry.month)}
            </DataGridGroupRow>
          ) : (
            row(entry.transaction, item)
          );
        })}
      </DataGridBody>
    </DataGrid>
  );
};

const MobileRow = ({
  dataIndex,
  measureRef,
  onOpen,
  scoped,
  selection,
  today,
  transaction,
}: {
  dataIndex: number;
  measureRef: (node: HTMLElement | null) => void;
  selection?: LedgerProps["selection"];
  onOpen: (transaction: Transaction) => void;
  scoped?: boolean;
  today: string;
  transaction: Transaction;
}) => {
  const view = describeTransaction(transaction, { scoped });
  const label = rowLabel(transaction, view.title, today);
  return (
    <div className="flex items-center" data-index={dataIndex} ref={measureRef}>
      {selection ? (
        <div className="pl-2">
          <RowCheckbox
            transaction={transaction}
            selection={selection}
            label={label}
          />
        </div>
      ) : null}
      <ListItemButton aria-label={label} onClick={() => onOpen(transaction)}>
        <ListItemLeading>
          <TransactionTile transaction={transaction} />
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>{view.title}</ListItemTitle>
          <ListItemDescription>
            {formatShortDate(transaction.transactionDate, today)} ·{" "}
            {view.subtitle}
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing stacked>
          <Amount
            weight="medium"
            currency={transaction.currencyCode}
            sign={view.sign}
            tone={amountTone(transaction, view)}
            value={transaction.amount}
          />
          <span className="flex gap-1">
            <StatusBadges transaction={transaction} />
          </span>
        </ListItemTrailing>
      </ListItemButton>
    </div>
  );
};

const MobileLedger = ({
  groups,
  onOpen,
  scoped,
  selection,
  today,
  transactions,
}: LedgerProps) => {
  const entries = useMemo(
    () => flattenEntries(groups, transactions),
    [groups, transactions]
  );
  const { listRef, scrollMargin, virtualizer } =
    useVirtualLedger<HTMLDivElement>(entries, "mobile");
  return (
    <div className="flex flex-col" ref={listRef}>
      {withSpacers(
        virtualizer.getVirtualItems(),
        scrollMargin,
        virtualizer.getTotalSize()
      ).map((item) => {
        if ("spacer" in item) {
          return <Spacer height={item.height} key={item.key} />;
        }
        const entry = entries[item.index];
        if (!entry) {
          return null;
        }
        return entry.kind === "group" ? (
          <h3
            className="bg-background/92 sticky top-13 z-10 px-2 pt-4 pb-1.5 text-xs font-semibold group-data-[sticky]/ledger:top-40 supports-[backdrop-filter]:backdrop-blur-md"
            data-index={item.index}
            key={item.key}
            ref={virtualizer.measureElement}
          >
            {formatMonthYear(entry.month)}
          </h3>
        ) : (
          <MobileRow
            dataIndex={item.index}
            key={item.key}
            measureRef={virtualizer.measureElement}
            onOpen={onOpen}
            scoped={scoped}
            selection={selection}
            today={today}
            transaction={entry.transaction}
          />
        );
      })}
    </div>
  );
};

/**
 * The ledger: a sortable, month-grouped grid on wide screens and a touch list
 * on phones. Row actions live in a contextual menu; opening a row shows its
 * detail.
 */
export const Ledger = (props: LedgerProps) => {
  const wide = useMediaQuery({ min: 768 });
  return wide ? <DesktopLedger {...props} /> : <MobileLedger {...props} />;
};
