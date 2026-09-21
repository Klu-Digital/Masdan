import { hasPermission } from "@masdan/auth/permissions";
import { Badge } from "@masdan/ui/components/badge";
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
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";

import { activeOrganizationQueryOptions } from "@/lib/organization";
import { formatBalance } from "@/modules/accounts/components/account-manager";
import { CategoryBadge } from "@/modules/categories/components/category-badge";
import { TransactionFormDialog } from "@/modules/transactions/components/transaction-form";
import {
  invalidateTransactions,
  transactionQueryOptions,
} from "@/modules/transactions/queries";
import { client } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/transactions/$transactionId");

// oxlint-disable-next-line complexity
const TransactionPage = () => {
  const { transactionId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const queryClient = useQueryClient();
  const transaction = useQuery(transactionQueryOptions(transactionId));
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );
  const archiveMutation = useMutation({
    mutationFn: (restore: boolean) =>
      restore
        ? client.transactions.restore({ transactionId })
        : client.transactions.archive({ transactionId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, restore) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: transactionQueryOptions(transactionId).queryKey,
        }),
        invalidateTransactions(queryClient, activeOrganizationId),
      ]);
      toastManager.add({
        title: restore ? "Transaction restored" : "Transaction archived",
        type: "success",
      });
    },
  });

  if (!activeOrganizationId) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyTitle>No active household</EmptyTitle>
          <EmptyDescription>
            Create or join a household before viewing transactions.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  if (transaction.isPending || organization.isPending) {
    return <Skeleton className="m-6 h-96" />;
  }
  if (
    transaction.isError ||
    organization.isError ||
    !transaction.data ||
    !organization.data
  ) {
    return (
      <p className="text-muted-foreground p-6">Could not load transaction.</p>
    );
  }

  const role =
    organization.data.members?.find(
      (member) => member.userId === session.user.id
    )?.role ?? "";
  if (!hasPermission({ permissions: { transaction: ["read"] }, role })) {
    return (
      <p className="text-muted-foreground p-6">You cannot view transactions.</p>
    );
  }

  const current = transaction.data;
  const archived = current.archivedAt !== null;
  const canUpdate = hasPermission({
    permissions: { transaction: ["update"] },
    role,
  });
  const canArchive = hasPermission({
    permissions: { transaction: ["archive"] },
    role,
  });
  const canRestore = hasPermission({
    permissions: { transaction: ["restore"] },
    role,
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            className="text-muted-foreground text-sm"
            search={search}
            to="/transactions"
          >
            ← Transactions
          </Link>
          <h1 className="font-heading mt-2 text-2xl font-semibold">
            {current.categoryIcon} {current.categoryName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {current.accountName} · {current.transactionDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={archived ? "outline" : "default"}>
            {archived ? "Archived" : "Active"}
          </Badge>
          {current.paidStatus === "paid" ? (
            <Badge>Paid</Badge>
          ) : (
            <Badge variant="outline">Unpaid</Badge>
          )}
          {!archived && canUpdate ? (
            <TransactionFormDialog
              activeOrganizationId={activeOrganizationId}
              canUpdate={canUpdate}
              transaction={current}
            />
          ) : null}
          {archived && canRestore ? (
            <Button
              loading={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate(true)}
              variant="outline"
            >
              Restore
            </Button>
          ) : null}
          {!archived && canArchive ? (
            <Button
              loading={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate(false)}
              variant="ghost"
            >
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {current.type === "income" ? "Income" : "Expense"}
          </CardTitle>
          <CardDescription>Recorded in {current.currencyCode}.</CardDescription>
        </CardHeader>
        <CardPanel>
          <p className="font-heading text-3xl font-semibold tabular-nums">
            {current.type === "income" ? "+" : "-"}
            {formatBalance(current.amount, current.currencyCode)}
          </p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-sm">Category</dt>
              <dd>{current.categoryName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Account</dt>
              <dd>{current.accountName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Date</dt>
              <dd>{current.transactionDate}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-sm">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {current.tags.length > 0
                  ? current.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline">
                        {tag.name}
                      </Badge>
                    ))
                  : "None"}
              </dd>
            </div>
          </dl>
          {current.notes ? (
            <div className="mt-6">
              <dt className="text-muted-foreground text-sm">Notes</dt>
              <dd className="whitespace-pre-wrap">{current.notes}</dd>
            </div>
          ) : null}
          {current.splits.length > 0 ? (
            <div className="mt-6">
              <h2 className="font-medium">Split allocation</h2>
              <div className="mt-3 space-y-2">
                {current.splits.map((split) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={split.id}
                  >
                    <CategoryBadge
                      color={split.categoryColor}
                      icon={split.categoryIcon}
                      name={split.categoryName}
                    />
                    <span className="tabular-nums">
                      {current.type === "income" ? "+" : "-"}
                      {formatBalance(split.amount, current.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardPanel>
      </Card>
    </div>
  );
};

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/transactions/$transactionId")({
  component: TransactionPage,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      transactionQueryOptions(params.transactionId)
    ),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.categoryName ?? "Transaction" }],
  }),
});
/* oxlint-enable sort-keys */
