import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
import { Amount } from "@masdan/ui/components/amount";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Spinner } from "@masdan/ui/components/spinner";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageSkeleton } from "@/components/household-gate";
import {
  accountsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { categoriesQueryOptions } from "@/modules/categories/queries";
import { invalidateTransactions } from "@/modules/transactions/queries";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { client } from "@/utils/orpc";

import {
  importQueryOptions,
  importRowsQueryOptions,
  invalidateImport,
  isImportProcessing,
} from "../queries";
import type { ImportRow, TransactionImport } from "../queries";
import { ImportStatusBadge } from "./import-status";
import { MappingForm, toFormValues } from "./mapping-form";
import type { ImportConfig } from "./mapping-form";

type RowFilter = "all" | "invalid" | "valid" | "duplicate" | "imported";

const ROW_FILTERS: { label: string; value: RowFilter }[] = [
  { label: "All rows", value: "all" },
  { label: "Needs attention", value: "invalid" },
  { label: "Ready", value: "valid" },
  { label: "Duplicates", value: "duplicate" },
  { label: "Imported", value: "imported" },
];

const ROW_STATUS: Record<
  string,
  { label: string; variant: "error" | "success" | "outline" | "info" }
> = {
  duplicate: { label: "Duplicate", variant: "outline" },
  imported: { label: "Imported", variant: "success" },
  invalid: { label: "Rejected", variant: "error" },
  valid: { label: "Ready", variant: "info" },
};

const RowsTable = ({
  currency,
  rows,
}: {
  currency: string;
  rows: ImportRow[];
}) => (
  <Table aria-label="Import rows" variant="card">
    <TableHeader>
      <TableRow>
        <TableHead>Row</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Description</TableHead>
        <TableHead className="text-right">Amount</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => {
        const status = ROW_STATUS[row.status] ?? ROW_STATUS.valid;
        return (
          <TableRow key={row.id}>
            <TableCell className="align-top">
              <span className="text-muted-foreground tabular-nums">
                {row.rowNumber}
              </span>
            </TableCell>
            <TableCell className="align-top">
              <span className="tabular-nums">{row.transactionDate ?? "—"}</span>
            </TableCell>
            <TableCell className="max-w-72 align-top">
              <span className="block truncate">{row.description ?? "—"}</span>
              {row.errors.length > 0 ? (
                <span className="text-muted-foreground block truncate text-xs">
                  {row.raw.join(" · ")}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right align-top">
              {row.amount ? (
                <Amount
                  currency={currency}
                  sign={row.type === "income" ? "in" : "out"}
                  tone="auto"
                  value={row.amount}
                />
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="align-top">
              <Badge variant={status?.variant}>{status?.label}</Badge>
              {row.errors.map((error) => (
                <span
                  className="text-destructive-foreground mt-1 block text-xs"
                  key={`${error.field}-${error.message}`}
                >
                  {error.message}
                </span>
              ))}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

const Counts = ({ current }: { current: TransactionImport }) => {
  const done = current.status === "completed";
  return (
    <StatGroup aria-label="Import counts">
      <Stat>
        <StatLabel>Rows in file</StatLabel>
        <StatValue>{current.totalRows.toLocaleString()}</StatValue>
      </Stat>
      <Stat>
        <StatLabel>{done ? "Imported" : "Ready to import"}</StatLabel>
        <StatValue>
          {(done ? current.importedRows : current.validRows).toLocaleString()}
        </StatValue>
      </Stat>
      <Stat>
        <StatLabel>Rejected</StatLabel>
        <StatValue>{current.invalidRows.toLocaleString()}</StatValue>
      </Stat>
      <Stat>
        <StatLabel>Duplicates skipped</StatLabel>
        <StatValue>{current.duplicateRows.toLocaleString()}</StatValue>
      </Stat>
    </StatGroup>
  );
};

const Processing = ({ status }: { status: string }) => (
  <Empty aria-live="polite">
    <Spinner />
    <EmptyTitle>
      {status === "validating" ? "Checking every row…" : "Adding transactions…"}
    </EmptyTitle>
    <EmptyDescription>
      This runs in the background, so you can leave this page. If it stays here
      for more than a few minutes, the background worker may be offline.
    </EmptyDescription>
  </Empty>
);

// Every import status renders its own panel and actions.
// oxlint-disable-next-line complexity
export const ImportDetailPage = ({
  activeOrganizationId,
  canImport,
  importId,
}: {
  activeOrganizationId: string;
  canImport: boolean;
  importId: string;
}) => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RowFilter>("all");
  const [editing, setEditing] = useState(false);
  const imported = useQuery(importQueryOptions(importId));
  const current = imported.data;
  const status = current?.status;
  const rows = useQuery({
    ...importRowsQueryOptions({
      importId,
      pageSize: 200,
      statuses: filter === "all" ? [] : [filter],
    }),
    enabled: current !== undefined && !isImportProcessing(status),
  });
  const accounts = useQuery({
    ...accountsQueryOptions(activeOrganizationId),
    enabled: editing,
  });
  const categories = useQuery({
    ...categoriesQueryOptions(activeOrganizationId),
    enabled: editing,
  });

  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === "committing" && status === "completed") {
      void invalidateTransactions(queryClient, activeOrganizationId);
      void invalidateAccounts(queryClient, activeOrganizationId);
    }
    previousStatus.current = status;
  }, [activeOrganizationId, queryClient, status]);

  const act = useMutation({
    mutationFn: (action: "commit" | "discard" | "retry") =>
      client.imports[action]({ importId }),
    onError: (error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(importQueryOptions(importId).queryKey, (old) =>
        old ? { ...old, ...updated } : old
      );
      await invalidateImport(queryClient, importId);
    },
  });

  const remap = async (config: ImportConfig) => {
    try {
      await client.imports.update({ ...config, importId });
      setEditing(false);
      setFilter("all");
      await invalidateImport(queryClient, importId);
    } catch (error) {
      toastManager.add({
        title: error instanceof Error ? error.message : "Couldn’t save mapping",
        type: "error",
      });
    }
  };

  const sampleRows = rows.data?.items;
  const sample = useCallback(
    () => ({
      headers: current?.headers ?? [],
      records: (sampleRows ?? []).map((row) => ({
        cells: row.raw,
        rowNumber: row.rowNumber,
      })),
      truncated: true,
    }),
    [current?.headers, sampleRows]
  );

  if (imported.isPending) {
    return <PageSkeleton />;
  }
  if (!current) {
    return (
      <Page width="narrow">
        <Empty>
          <EmptyTitle>Import not found</EmptyTitle>
          <EmptyDescription>
            It may belong to another household.
          </EmptyDescription>
          <Button render={<Link to="/imports" />} variant="secondary">
            Back to imports
          </Button>
        </Empty>
      </Page>
    );
  }

  const currency = current.currencyCode;

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>{current.fileName}</PageTitle>
          <PageDescription>
            <span className="flex flex-wrap items-center gap-2">
              Into {current.accountName}
              <ImportStatusBadge status={current.status} />
            </span>
          </PageDescription>
        </PageHeading>
        {canImport && status === "ready" && !editing ? (
          <PageActions>
            <Button
              disabled={act.isPending}
              onClick={() => act.mutate("discard")}
              variant="ghost"
            >
              Discard
            </Button>
            <Button onClick={() => setEditing(true)} variant="secondary">
              Change mapping
            </Button>
            <Button
              disabled={current.validRows === 0}
              loading={act.isPending && act.variables === "commit"}
              onClick={() => act.mutate("commit")}
            >
              {`Import ${current.validRows.toLocaleString()} transactions`}
            </Button>
          </PageActions>
        ) : null}
      </PageHeader>

      {isImportProcessing(status) ? (
        <Processing status={current.status} />
      ) : null}

      {status === "failed" ? (
        <Alert variant="error">
          <AlertTitle>The import stopped</AlertTitle>
          <AlertDescription>
            {current.error}
            {canImport ? (
              <span className="mt-2 flex gap-2">
                <Button
                  loading={act.isPending && act.variables === "retry"}
                  onClick={() => act.mutate("retry")}
                  size="sm"
                >
                  Try again
                </Button>
                <Button
                  onClick={() => act.mutate("discard")}
                  size="sm"
                  variant="ghost"
                >
                  Discard
                </Button>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "completed" ? (
        <Alert variant="success">
          <AlertTitle>
            {`${current.importedRows.toLocaleString()} transactions imported`}
          </AlertTitle>
          <AlertDescription>
            They appear on their original dates and count toward{" "}
            {current.accountName}’s balance and your reports.
            <span className="mt-2 flex">
              <Button
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      accountIds: [current.accountId],
                    }}
                    to="/transactions"
                  />
                }
                size="sm"
                variant="secondary"
              >
                View transactions
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "discarded" ? (
        <Alert>
          <AlertTitle>Discarded</AlertTitle>
          <AlertDescription>Nothing from this file was added.</AlertDescription>
        </Alert>
      ) : null}

      {current.previousImport && status === "ready" ? (
        <Alert variant="warning">
          <AlertTitle>This file was imported before</AlertTitle>
          <AlertDescription>
            Rows already in {current.accountName} are marked as duplicates and
            will be skipped.
          </AlertDescription>
        </Alert>
      ) : null}

      {isImportProcessing(status) ? null : <Counts current={current} />}

      {editing && accounts.data && categories.data ? (
        <MappingForm
          accounts={accounts.data}
          categories={categories.data}
          initialValues={toFormValues(current)}
          lockSource
          onCancel={() => setEditing(false)}
          onSubmit={remap}
          sample={sample}
          submitLabel="Check rows again"
        />
      ) : null}

      {!editing && current.totalRows > 0 && !isImportProcessing(status) ? (
        <section className="flex flex-col gap-3">
          <Tabs
            onValueChange={(value) => setFilter(value as RowFilter)}
            value={filter}
          >
            <TabsList aria-label="Filter rows">
              {ROW_FILTERS.map((option) => (
                <TabsTab key={option.value} value={option.value}>
                  {option.label}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
          {rows.data && rows.data.items.length > 0 ? (
            <RowsTable currency={currency} rows={rows.data.items} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {rows.isPending ? "Loading rows…" : "No rows here."}
            </p>
          )}
          {rows.data && rows.data.total > rows.data.items.length ? (
            <p className="text-muted-foreground text-xs">
              {`Showing the first ${rows.data.items.length.toLocaleString()} of ${rows.data.total.toLocaleString()} rows.`}
            </p>
          ) : null}
        </section>
      ) : null}
    </Page>
  );
};
