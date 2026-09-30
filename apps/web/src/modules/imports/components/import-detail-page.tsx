import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Amount } from "@/components/finance/amount";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { PageSkeleton } from "@/components/household-gate";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { downloadCsv } from "@/modules/exports/download";
import { ruleEffects, ruleReasons } from "@/modules/rules/presentation";
import {
  ImportRowSuggestion,
  ImportSuggestionsBar,
} from "@/modules/suggestions/components/import-suggestions";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import type { ImportRow, TransactionImport } from "../types";
import { ImportStatusBadge } from "./import-status";
import { MappingForm, toFormValues } from "./mapping-form";
import type { ImportConfig } from "./mapping-form";

type RowFilter =
  | "all"
  | "invalid"
  | "valid"
  | "duplicate"
  | "imported"
  | "suggested";

const ROW_FILTERS: { label: string; value: RowFilter }[] = [
  { label: "All rows", value: "all" },
  { label: "Needs attention", value: "invalid" },
  { label: "Ready", value: "valid" },
  { label: "Duplicates", value: "duplicate" },
  { label: "Imported", value: "imported" },
];

const SUGGESTED_FILTER: { label: string; value: RowFilter } = {
  label: "Suggestions",
  value: "suggested",
};

const ROW_STATUS: Record<
  string,
  { label: string; variant: "error" | "success" | "outline" | "info" }
> = {
  duplicate: { label: "Duplicate", variant: "outline" },
  imported: { label: "Imported", variant: "success" },
  invalid: { label: "Rejected", variant: "error" },
  valid: { label: "Ready", variant: "info" },
};

type RuleApplication = NonNullable<ImportRow["ruleApplication"]>;
type Categories = NonNullable<ReturnType<typeof useCategories>["data"]>;
type Tags = NonNullable<ReturnType<typeof useTags>["data"]>;

const POLL_INTERVAL_MS = 1500;

const isImportProcessing = (status: string | undefined): boolean =>
  status === "validating" || status === "committing";

const useCategories = (activeOrganizationId: string) =>
  useQuery(
    householdOrpc(activeOrganizationId).categories.list.queryOptions({
      input: { includeArchived: true },
    })
  );
const useTags = (activeOrganizationId: string) =>
  useQuery(
    householdOrpc(activeOrganizationId).tags.list.queryOptions({
      input: { includeArchived: true },
    })
  );

const RowsTable = ({
  activeOrganizationId,
  categories,
  currency,
  describeRule,
  importId,
  review,
  rows,
  tags,
}: {
  activeOrganizationId: string;
  categories: Categories;
  currency: string;
  describeRule: (application: RuleApplication) => string;
  importId: string;
  /** Present while suggestions are on; `canReview` gates the actions. */
  review: { canReview: boolean } | null;
  rows: ImportRow[];
  tags: Tags;
}) => (
  <Table aria-label="Import rows" variant="card">
    <TableHeader>
      <TableRow>
        <TableHead>Row</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Description</TableHead>
        <TableHead>Category</TableHead>
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
              {row.ruleApplication ? (
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  <Badge size="sm" variant="brand">
                    Rule
                  </Badge>{" "}
                  <span className="text-foreground font-medium">
                    {row.ruleApplication.ruleName}
                  </span>
                  {` — ${describeRule(row.ruleApplication)}`}
                </span>
              ) : null}
              {row.errors.length > 0 ? (
                <span className="text-muted-foreground block truncate text-xs">
                  {row.raw.join(" · ")}
                </span>
              ) : null}
              {review || row.suggestionApplication ? (
                <ImportRowSuggestion
                  activeOrganizationId={activeOrganizationId}
                  canReview={review?.canReview ?? false}
                  categories={categories}
                  importId={importId}
                  row={row}
                  tags={tags}
                />
              ) : null}
            </TableCell>
            <TableCell className="align-top">
              <span className="block truncate">
                {categories.find(({ id }) => id === row.categoryId)?.name ??
                  "—"}
              </span>
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
  const suggestionsEnabled = useFeatureFlag("FF__AI_CATEGORIZATION");
  const orpc = householdOrpc(activeOrganizationId);
  const imported = useQuery(
    orpc.imports.get.queryOptions({
      input: { importId },
      refetchInterval: (query) =>
        isImportProcessing(query.state.data?.status) ? POLL_INTERVAL_MS : false,
    })
  );
  const current = imported.data;
  const status = current?.status;
  const rows = useQuery(
    orpc.imports.rows.queryOptions({
      enabled: current !== undefined && !isImportProcessing(status),
      input: {
        importId,
        pageSize: 200,
        statuses: filter === "all" || filter === "suggested" ? [] : [filter],
        suggestionPending: filter === "suggested",
      },
      placeholderData: keepPreviousData,
    })
  );
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const household = useQuery(
    orpc.households.profile.queryOptions({ enabled: editing })
  );
  const categories = useCategories(activeOrganizationId);
  const tags = useTags(activeOrganizationId);

  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === "committing" && status === "completed") {
      void invalidate(queryClient, activeOrganizationId, "ledger");
    }
    previousStatus.current = status;
  }, [activeOrganizationId, queryClient, status]);

  const act = useMutation({
    mutationFn: (action: "commit" | "discard" | "retry") =>
      orpc.imports[action].call({ importId }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        orpc.imports.get.queryKey({ input: { importId } }),
        (old) => (old ? { ...old, ...updated } : old)
      );
      await invalidate(queryClient, activeOrganizationId, "imports");
    },
  });

  const downloadAttention = useMutation({
    mutationFn: () => orpc.imports.exportAttention.call({ importId }),
    onSuccess: ({ csv, fileName }) => downloadCsv(fileName, csv),
  });

  const update = useMutation(
    orpc.imports.update.mutationOptions({
      onSuccess: async () => {
        setEditing(false);
        setFilter("all");
        await invalidate(queryClient, activeOrganizationId, "imports");
      },
    })
  );
  const remap = async (config: ImportConfig) => {
    // The mutation cache toasts the failure; the form keeps its values.
    await update.mutateAsync({ ...config, importId }).catch(() => null);
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
  const reviewing = suggestionsEnabled && status === "ready";
  const describeRule = (application: RuleApplication): string =>
    [
      ...ruleReasons(application.conditions, accounts.data ?? []),
      ...ruleEffects({
        categoryName:
          categories.data?.find(({ id }) => id === application.categoryId)
            ?.name ?? null,
        tagNames: (tags.data ?? [])
          .filter(({ id }) => application.tagIds.includes(id))
          .map(({ name }) => name),
      }),
    ].join(" · ");

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>{current.fileName}</PageTitle>
          <PageDescription>
            <span className="flex flex-wrap items-center gap-2">
              {current.accountName
                ? `Into ${current.accountName}`
                : "No account"}
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
            {current.accountName
              ? `They appear on their original dates and count toward ${current.accountName}’s balance and your reports.`
              : "They appear on their original dates and count toward your reports without changing account balances."}
            <span className="mt-2 flex">
              <Button
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      accountIds: current.accountId ? [current.accountId] : [],
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
            Rows already in {current.accountName ?? "the household ledger"} are
            marked as duplicates and will be skipped.
          </AlertDescription>
        </Alert>
      ) : null}

      {isImportProcessing(status) ? null : <Counts current={current} />}

      {suggestionsEnabled && canImport && status === "ready" && !editing ? (
        <ImportSuggestionsBar
          activeOrganizationId={activeOrganizationId}
          importId={importId}
        />
      ) : null}

      {editing && household.isPending ? <PageSkeleton /> : null}
      {editing && household.isError ? (
        <Alert variant="error">
          <AlertTitle>Couldn’t load household settings</AlertTitle>
          <AlertDescription>Reload this page to try again.</AlertDescription>
        </Alert>
      ) : null}

      {editing && accounts.data && categories.data && household.data ? (
        <MappingForm
          accounts={accounts.data}
          categories={categories.data}
          currency={household.data.defaultCurrency.code}
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
              {(reviewing
                ? [...ROW_FILTERS, SUGGESTED_FILTER]
                : ROW_FILTERS
              ).map((option) => (
                <TabsTab key={option.value} value={option.value}>
                  {option.label}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
          {filter === "invalid" && current.invalidRows > 0 ? (
            <div className="flex justify-end">
              <Button
                loading={downloadAttention.isPending}
                onClick={() => downloadAttention.mutate()}
                size="sm"
                variant="secondary"
              >
                Download Needs attention CSV
              </Button>
            </div>
          ) : null}
          {rows.data && rows.data.items.length > 0 ? (
            <RowsTable
              activeOrganizationId={activeOrganizationId}
              categories={categories.data ?? []}
              currency={currency}
              describeRule={describeRule}
              importId={importId}
              review={reviewing ? { canReview: canImport } : null}
              rows={rows.data.items}
              tags={tags.data ?? []}
            />
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
