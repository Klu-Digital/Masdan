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
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { client } from "@/utils/orpc";

import { invalidateTransactions, transactionsQueryOptions } from "../queries";
import { TransactionFormDialog } from "./transaction-form";
import { TransactionTable } from "./transaction-table";

type Transaction = Awaited<ReturnType<typeof client.transactions.list>>[number];

export const TransactionManager = ({
  activeOrganizationId,
  role,
}: {
  activeOrganizationId: string;
  role: string;
}) => {
  const queryClient = useQueryClient();
  const transactions = useQuery(transactionsQueryOptions(activeOrganizationId));
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [showArchived, setShowArchived] = useState(false);
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

  if (transactions.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (transactions.isError) {
    return (
      <p className="text-muted-foreground">Could not load transactions.</p>
    );
  }

  const visibleTransactions = showArchived
    ? transactions.data
    : transactions.data.filter(
        (transaction) => transaction.archivedAt === null
      );
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

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              Recent household income and expenses. Full search and filtering
              are coming later.
            </CardDescription>
          </div>
          {hasPermission({ permissions: { transaction: ["create"] }, role }) ? (
            <TransactionFormDialog
              activeOrganizationId={activeOrganizationId}
              canCreate
            />
          ) : null}
        </CardHeader>
        <CardPanel>
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => setShowArchived((value) => !value)}
              size="sm"
              variant="ghost"
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          </div>
          {visibleTransactions.length === 0 ? (
            <Empty>
              <EmptyTitle>No transactions found</EmptyTitle>
              <EmptyDescription>
                Add income or an expense to start building your household
                ledger.
              </EmptyDescription>
            </Empty>
          ) : (
            <TransactionTable
              canArchive={canArchive}
              canRestore={canRestore}
              canUpdate={canUpdate}
              onArchive={(id) => archiveMutation.mutate({ id, restore: false })}
              onEdit={setEditingTransaction}
              onRestore={(id) => archiveMutation.mutate({ id, restore: true })}
              transactions={visibleTransactions}
            />
          )}
        </CardPanel>
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
    </>
  );
};
