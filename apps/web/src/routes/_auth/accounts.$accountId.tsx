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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";

import { activeOrganizationQueryOptions } from "@/lib/organization";
import {
  AccountFormDialog,
  formatBalance,
} from "@/modules/accounts/components/account-manager";
import { CreditCardSection } from "@/modules/accounts/components/credit-card-summary";
import {
  accountQueryOptions,
  accountSnapshotsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { currenciesQueryOptions } from "@/modules/currency/queries";
import { householdProfileQueryOptions } from "@/modules/household/queries";
import { TransferFormDialog } from "@/modules/transactions/components/transfer-form";
import { transactionsQueryOptions } from "@/modules/transactions/queries";
import type { Transaction } from "@/modules/transactions/queries";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { client } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/accounts/$accountId");

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  auto_loan: "Auto loan",
  bank: "Bank",
  cash: "Cash",
  credit_card: "Credit card",
  e_wallet: "E-wallet",
  investment: "Investment",
  mortgage: "Mortgage",
  other_asset: "Other asset",
  other_liability: "Other liability",
  payable: "Payable",
  personal_loan: "Personal loan",
  property: "Property",
  receivable: "Receivable",
  vehicle: "Vehicle",
};

const cardActivityLabel = (entry: Transaction): string => {
  if (!entry.transfer) {
    return entry.categoryName ?? "Purchase";
  }
  return entry.transferSide === "destination" ? "Card payment" : "Transfer";
};

const CardActivity = ({
  accountId,
  organizationId,
}: {
  accountId: string;
  organizationId: string;
}) => {
  const activity = useQuery(
    transactionsQueryOptions(organizationId, {
      accountIds: [accountId],
      pageSize: 10,
    })
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Card activity</CardTitle>
          <CardDescription>Recent purchases and payments.</CardDescription>
        </div>
        <Link
          className="text-sm underline-offset-4 hover:underline"
          search={{ ...DEFAULT_TRANSACTION_SEARCH, accountIds: [accountId] }}
          to="/transactions"
        >
          View all
        </Link>
      </CardHeader>
      <CardPanel>
        {activity.isPending ? <Skeleton className="h-32 w-full" /> : null}
        {activity.isError ? (
          <p className="text-muted-foreground">Could not load card activity.</p>
        ) : null}
        {activity.data?.items.length === 0 ? (
          <p className="text-muted-foreground">No card activity yet.</p>
        ) : null}
        {activity.data?.items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.data.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.transactionDate}</TableCell>
                  <TableCell>
                    <Link
                      className="underline-offset-4 hover:underline"
                      params={{ transactionId: entry.id }}
                      to="/transactions/$transactionId"
                    >
                      {cardActivityLabel(entry)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">
                      {formatBalance(entry.amount, entry.currencyCode)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardPanel>
    </Card>
  );
};

// Detail loading and permission states are kept together for one account view.
// oxlint-disable-next-line complexity
const AccountPage = () => {
  const { accountId } = routeApi.useParams();
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const queryClient = useQueryClient();
  const account = useQuery(accountQueryOptions(accountId));
  const snapshots = useQuery(accountSnapshotsQueryOptions(accountId));
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );
  const profile = useQuery(householdProfileQueryOptions(activeOrganizationId));
  const currencies = useQuery(currenciesQueryOptions());
  const archiveMutation = useMutation({
    mutationFn: (restore: boolean) =>
      restore
        ? client.accounts.restore({ accountId })
        : client.accounts.archive({ accountId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, restore) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account", accountId] }),
        invalidateAccounts(queryClient, activeOrganizationId),
      ]);
      toastManager.add({
        title: restore ? "Account restored" : "Account archived",
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
            Create or join a household before viewing accounts.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  if (
    account.isPending ||
    snapshots.isPending ||
    organization.isPending ||
    profile.isPending ||
    currencies.isPending
  ) {
    return <Skeleton className="m-6 h-96" />;
  }

  if (
    account.isError ||
    snapshots.isError ||
    currencies.isError ||
    !account.data ||
    !organization.data ||
    !profile.data ||
    !currencies.data
  ) {
    return <p className="text-muted-foreground p-6">Could not load account.</p>;
  }

  const role =
    organization.data.members?.find(
      (member) => member.userId === session.user.id
    )?.role ?? "";
  const archived = account.data.archivedAt !== null;
  const canUpdate = hasPermission({
    permissions: { financialAccount: ["update"] },
    role,
  });
  const canArchive = hasPermission({
    permissions: { financialAccount: ["archive"] },
    role,
  });
  const canRestore = hasPermission({
    permissions: { financialAccount: ["restore"] },
    role,
  });

  return (
    <div className="mx-auto w-full space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-muted-foreground text-sm" to="/accounts">
            ← Accounts
          </Link>
          <h1 className="font-heading mt-2 text-2xl font-semibold">
            {account.data.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {account.data.institution ??
              ACCOUNT_TYPE_LABELS[account.data.accountType]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={archived ? "outline" : "default"}>
            {archived ? "Archived" : "Active"}
          </Badge>
          <AccountFormDialog
            account={account.data}
            activeOrganizationId={activeOrganizationId}
            canCreate={false}
            canUpdate={canUpdate}
            currencies={currencies.data}
            defaultCurrency={profile.data.defaultCurrency.code}
            members={organization.data.members ?? []}
          />
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
          <CardTitle>Balance</CardTitle>
          <CardDescription>
            Opening balance and later ledger movements determine this value.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <p className="font-heading text-3xl font-semibold tabular-nums">
            {formatBalance(account.data.balance, account.data.currencyCode)}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Opening balance:{" "}
            {formatBalance(
              account.data.openingBalance,
              account.data.currencyCode
            )}
            {" · "}
            {account.data.openingBalanceDate}
          </p>
        </CardPanel>
      </Card>

      {account.data.accountType === "credit_card" ? (
        <>
          {!archived &&
          hasPermission({ permissions: { transaction: ["create"] }, role }) ? (
            <TransferFormDialog
              activeOrganizationId={activeOrganizationId}
              canCreate
              destinationAccountId={account.data.id}
              triggerLabel="Pay card"
            />
          ) : null}
          <CreditCardSection
            account={account.data}
            canUpdate={canUpdate}
            organizationId={activeOrganizationId}
          />
          <Card>
            <CardHeader>
              <CardTitle>Credit card details</CardTitle>
              <CardDescription>
                Card identity and expected statement schedule.
              </CardDescription>
            </CardHeader>
            <CardPanel>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-sm">Network</dt>
                  <dd>{account.data.cardNetwork ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">
                    Last four digits
                  </dt>
                  <dd>
                    {account.data.cardLastFour
                      ? `•••• ${account.data.cardLastFour}`
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">
                    Statement closing day
                  </dt>
                  <dd>{account.data.statementClosingDay ?? "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">
                    Payment due day
                  </dt>
                  <dd>{account.data.paymentDueDay ?? "Not set"}</dd>
                </div>
              </dl>
            </CardPanel>
          </Card>
          <CardActivity
            accountId={account.data.id}
            organizationId={activeOrganizationId}
          />
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Balance history</CardTitle>
          <CardDescription>
            Historical snapshots preserve balances when complete transactions
            are unavailable.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {snapshots.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No historical balance snapshots yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.data.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>{snapshot.effectiveDate}</TableCell>
                    <TableCell>
                      <span className="tabular-nums">
                        {formatBalance(
                          snapshot.balance,
                          account.data.currencyCode
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{snapshot.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardPanel>
      </Card>
    </div>
  );
};

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/accounts/$accountId")({
  component: AccountPage,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(accountQueryOptions(params.accountId)),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? "Account" }],
  }),
});
/* oxlint-enable sort-keys */
