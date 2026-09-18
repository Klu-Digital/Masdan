import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { useNavigate } from "@tanstack/react-router";

import { formatBalance } from "@/modules/accounts/components/account-manager";
import { CategoryBadge } from "@/modules/categories/components/category-badge";
import { TagBadge } from "@/modules/tags/components/tag-badge";
import type { client } from "@/utils/orpc";

type Transaction = Awaited<ReturnType<typeof client.transactions.list>>[number];

export const TransactionTable = ({
  canArchive,
  canRestore,
  canUpdate,
  onArchive,
  onEdit,
  onRestore,
  transactions,
}: {
  canArchive: boolean;
  canRestore: boolean;
  canUpdate: boolean;
  onArchive: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onRestore: (id: string) => void;
  transactions: Transaction[];
}) => {
  const navigate = useNavigate();
  const openTransaction = (transactionId: string) =>
    navigate({
      params: { transactionId },
      to: "/transactions/$transactionId",
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Transaction</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const archived = transaction.archivedAt !== null;
          const income = transaction.type === "income";
          return (
            <TableRow
              aria-label={`View ${transaction.categoryName} transaction`}
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
              <TableCell>{transaction.transactionDate}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge
                    color={transaction.categoryColor}
                    icon={transaction.categoryIcon}
                    name={transaction.categoryName}
                  />
                  {transaction.tags.map((tag) => (
                    <TagBadge color={tag.color} key={tag.id} name={tag.name} />
                  ))}
                </div>
                {transaction.notes ? (
                  <div className="text-muted-foreground max-w-56 truncate text-xs">
                    {transaction.notes}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>{transaction.accountName}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge
                    variant={
                      transaction.paidStatus === "paid" ? "default" : "outline"
                    }
                  >
                    {transaction.paidStatus === "paid" ? "Paid" : "Unpaid"}
                  </Badge>
                  {archived ? <Badge variant="outline">Archived</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={
                    income
                      ? "text-success tabular-nums"
                      : "text-destructive tabular-nums"
                  }
                >
                  {income ? "+" : "-"}
                  {formatBalance(transaction.amount, transaction.currencyCode)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {canUpdate && !archived ? (
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
                  {archived && canRestore ? (
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
                  {!archived && canArchive ? (
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
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
