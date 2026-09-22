/* oxlint-disable complexity */

import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridColumnHeader,
  DataGridHeader,
  DataGridRow,
} from "@masdan/ui/data-grid";
import { useNavigate } from "@tanstack/react-router";

import { formatBalance } from "@/modules/accounts/components/account-manager";
import { CategoryBadge } from "@/modules/categories/components/category-badge";
import { TagBadge } from "@/modules/tags/components/tag-badge";

import type { Transaction } from "../queries";
import type { TransactionSortBy, TransactionSortDirection } from "../search";

export const TransactionTable = ({
  canArchive,
  canRestore,
  canUpdate,
  onArchive,
  onDeleteTransfer,
  onEdit,
  onEditTransfer,
  onRestore,
  onSort,
  sortBy,
  sortDirection,
  transactions,
}: {
  canArchive: boolean;
  canRestore: boolean;
  canUpdate: boolean;
  onArchive: (id: string) => void;
  onDeleteTransfer: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onEditTransfer: (transfer: NonNullable<Transaction["transfer"]>) => void;
  onRestore: (id: string) => void;
  onSort: (sortBy: TransactionSortBy) => void;
  sortBy: TransactionSortBy;
  sortDirection: TransactionSortDirection;
  transactions: Transaction[];
}) => {
  const navigate = useNavigate();
  const openTransaction = (transactionId: string) =>
    navigate({
      params: { transactionId },
      to: "/transactions/$transactionId",
    });

  return (
    <DataGrid>
      <DataGridHeader>
        <DataGridRow>
          <DataGridColumnHeader
            direction={sortBy === "date" ? sortDirection : undefined}
            onSort={() => onSort("date")}
          >
            Date
          </DataGridColumnHeader>
          <DataGridColumnHeader>Transaction</DataGridColumnHeader>
          <DataGridColumnHeader>Account</DataGridColumnHeader>
          <DataGridColumnHeader>Status</DataGridColumnHeader>
          <DataGridColumnHeader
            direction={sortBy === "amount" ? sortDirection : undefined}
            onSort={() => onSort("amount")}
          >
            Amount
          </DataGridColumnHeader>
          <DataGridColumnHeader>Actions</DataGridColumnHeader>
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody>
        {transactions.map((transaction) => {
          const { accountClass, archivedAt, transfer, transferSide, type } =
            transaction;
          const archived = archivedAt !== null;
          const income = type === "income";
          const transferDecreasesBalance =
            transfer !== null &&
            ((accountClass === "asset" && transferSide === "source") ||
              (accountClass === "liability" && transferSide === "destination"));
          let amountPrefix = income ? "+" : "-";
          if (transfer) {
            amountPrefix = transferDecreasesBalance ? "-" : "+";
          }
          const decreasesBalance = transfer
            ? transferDecreasesBalance
            : !income;
          return (
            <DataGridRow
              aria-label={
                transfer
                  ? `View transfer ${transfer.sourceAccount.name} to ${transfer.destinationAccount.name}`
                  : `View ${transaction.categoryName ?? "transaction"} transaction`
              }
              className="cursor-pointer"
              key={transaction.id}
              onClick={() => openTransaction(transaction.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openTransaction(transaction.id);
                }
              }}
              tabIndex={0}
            >
              <DataGridCell>{transaction.transactionDate}</DataGridCell>
              <DataGridCell>
                <div className="flex flex-wrap items-center gap-2">
                  {transfer ? (
                    <Badge variant="outline">
                      {transferSide === "source"
                        ? `To ${transfer.destinationAccount.name}`
                        : `From ${transfer.sourceAccount.name}`}
                    </Badge>
                  ) : (
                    <CategoryBadge
                      color={transaction.categoryColor ?? "slate"}
                      icon={transaction.categoryIcon ?? ""}
                      name={transaction.categoryName ?? "Transaction"}
                    />
                  )}
                  {transfer === null
                    ? transaction.tags.map((tag) => (
                        <TagBadge
                          color={tag.color}
                          key={tag.id}
                          name={tag.name}
                        />
                      ))
                    : null}
                  {transfer === null && transaction.splits.length > 0 ? (
                    <Badge variant="outline">Split</Badge>
                  ) : null}
                </div>
                {transaction.notes ? (
                  <div className="text-muted-foreground max-w-56 truncate text-xs">
                    {transaction.notes}
                  </div>
                ) : null}
              </DataGridCell>
              <DataGridCell>{transaction.accountName}</DataGridCell>
              <DataGridCell>
                <div className="flex flex-wrap gap-1">
                  {transfer ? (
                    <Badge>Transfer</Badge>
                  ) : (
                    <Badge
                      variant={
                        transaction.paidStatus === "paid"
                          ? "default"
                          : "outline"
                      }
                    >
                      {transaction.paidStatus === "paid" ? "Paid" : "Unpaid"}
                    </Badge>
                  )}
                  {archived ? <Badge variant="outline">Archived</Badge> : null}
                </div>
              </DataGridCell>
              <DataGridCell className="text-right">
                <span
                  className={
                    decreasesBalance
                      ? "text-destructive tabular-nums"
                      : "text-success tabular-nums"
                  }
                >
                  {amountPrefix}
                  {formatBalance(transaction.amount, transaction.currencyCode)}
                </span>
              </DataGridCell>
              <DataGridCell>
                <div className="flex justify-end gap-2">
                  {transfer && canUpdate ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditTransfer(transfer);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      size="sm"
                      variant="outline"
                    >
                      Edit
                    </Button>
                  ) : null}
                  {transfer && canArchive ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteTransfer(transfer.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      size="sm"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  ) : null}
                  {transfer === null && canUpdate && !archived ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(transaction);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      size="sm"
                      variant="outline"
                    >
                      Edit
                    </Button>
                  ) : null}
                  {transfer === null && archived && canRestore ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onRestore(transaction.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      size="sm"
                      variant="outline"
                    >
                      Restore
                    </Button>
                  ) : null}
                  {transfer === null && !archived && canArchive ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchive(transaction.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      size="sm"
                      variant="ghost"
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </DataGridCell>
            </DataGridRow>
          );
        })}
      </DataGridBody>
    </DataGrid>
  );
};
