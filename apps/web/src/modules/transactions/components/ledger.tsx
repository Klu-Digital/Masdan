import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
import { Checkbox } from "@masdan/ui/components/checkbox";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItemButton,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridColumnHeader,
  DataGridGroupRow,
  DataGridHeader,
  DataGridRow,
} from "@masdan/ui/data-grid";
import { useMediaQuery } from "@masdan/ui/hooks/use-media-query";
import { Fragment } from "react";
import type React from "react";

import { formatDay, formatShortDate } from "@/lib/dates";

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
  transaction.transferId === null && transaction.archivedAt === null;

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
        aria-label="Select all transactions on this page"
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
  /** Group rows under day headings; only meaningful when sorted by date. */
  grouped?: boolean;
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

const groupByDay = (transactions: Transaction[]) => {
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const transaction of transactions) {
    const last = groups.at(-1);
    if (last && last.date === transaction.transactionDate) {
      last.items.push(transaction);
    } else {
      groups.push({ date: transaction.transactionDate, items: [transaction] });
    }
  }
  return groups;
};

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

const DesktopHeader = ({
  actions,
  grouped,
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
      {grouped ? null : (
        <DataGridColumnHeader
          direction={sort?.by === "date" ? sort.direction : undefined}
          onSort={sort ? () => sort.onSort("date") : undefined}
        >
          Date
        </DataGridColumnHeader>
      )}
      <DataGridColumnHeader
        direction={grouped && sort?.by === "date" ? sort.direction : undefined}
        onSort={grouped && sort ? () => sort.onSort("date") : undefined}
      >
        {grouped ? "Date" : "Transaction"}
      </DataGridColumnHeader>
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
    grouped,
    hideAccount,
    onOpen,
    scoped,
    selection,
    selectedId,
    today,
    transactions,
  } = props;
  const showDate = !grouped;
  const columnCount =
    2 +
    (hideAccount ? 0 : 1) +
    (showDate ? 1 : 0) +
    (actions ? 1 : 0) +
    (selection ? 1 : 0);
  const row = (transaction: Transaction) => {
    const view = describeTransaction(transaction, { scoped });
    const open = () => onOpen(transaction);
    return (
      <DataGridRow
        aria-label={rowLabel(transaction, view.title, today)}
        data-selected={selectedId === transaction.id || undefined}
        key={transaction.id}
        onClick={open}
        onKeyDown={openOnKey(open)}
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
        {showDate ? (
          <DataGridCell className="text-muted-foreground w-28 whitespace-nowrap tabular-nums">
            {formatShortDate(transaction.transactionDate, today)}
          </DataGridCell>
        ) : null}
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
            {transaction.accountName}
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
      <DataGridBody>
        {grouped
          ? groupByDay(transactions).map((group) => (
              <Fragment key={group.date}>
                <DataGridGroupRow colSpan={columnCount}>
                  {formatDay(group.date, today)}
                </DataGridGroupRow>
                {group.items.map(row)}
              </Fragment>
            ))
          : transactions.map(row)}
      </DataGridBody>
    </DataGrid>
  );
};

const MobileRow = ({
  onOpen,
  scoped,
  showDate,
  selection,
  today,
  transaction,
}: {
  selection?: LedgerProps["selection"];
  onOpen: (transaction: Transaction) => void;
  scoped?: boolean;
  showDate: boolean;
  today: string;
  transaction: Transaction;
}) => {
  const view = describeTransaction(transaction, { scoped });
  const label = rowLabel(transaction, view.title, today);
  return (
    <div className="flex items-center">
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
            {showDate
              ? `${formatShortDate(transaction.transactionDate, today)} · ${view.subtitle}`
              : view.subtitle}
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
  grouped,
  onOpen,
  scoped,
  selection,
  today,
  transactions,
}: LedgerProps) => {
  if (!grouped) {
    return (
      <List variant="plain">
        {transactions.map((transaction) => (
          <MobileRow
            key={transaction.id}
            onOpen={onOpen}
            scoped={scoped}
            selection={selection}
            showDate
            today={today}
            transaction={transaction}
          />
        ))}
      </List>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {groupByDay(transactions).map((group) => (
        <section
          aria-label={formatDay(group.date, today)}
          className="flex flex-col gap-1"
          key={group.date}
        >
          <h3 className="bg-background/92 sticky top-13 z-10 px-2 py-1.5 text-xs font-semibold supports-[backdrop-filter]:backdrop-blur-md">
            {formatDay(group.date, today)}
          </h3>
          <List variant="plain">
            {group.items.map((transaction) => (
              <MobileRow
                key={transaction.id}
                onOpen={onOpen}
                scoped={scoped}
                selection={selection}
                showDate={false}
                today={today}
                transaction={transaction}
              />
            ))}
          </List>
        </section>
      ))}
    </div>
  );
};

/**
 * The ledger: a sortable, date-grouped grid on wide screens and a touch list
 * on phones. Row actions live in a contextual menu; opening a row shows its
 * detail.
 */
export const Ledger = (props: LedgerProps) => {
  const wide = useMediaQuery({ min: 768 });
  return wide ? <DesktopLedger {...props} /> : <MobileLedger {...props} />;
};
