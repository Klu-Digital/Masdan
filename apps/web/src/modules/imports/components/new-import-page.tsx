import { FileImportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { guessImportMapping } from "@masdan/api/imports/mapping";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import {
  Page,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { uploadFile } from "@/lib/upload";
import { invalidate } from "@/utils/invalidate";
import { errorMessage, householdOrpc } from "@/utils/orpc";

import { asCsvUpload, isCsvFile, readLocalCsv, sampleCsv } from "../csv-file";
import type { LocalCsv } from "../csv-file";
import { ImportStatusBadge } from "./import-status";
import { MappingForm, toFormValues } from "./mapping-form";
import type {
  ImportAccount,
  ImportCategory,
  ImportConfig,
  ImportFormValues,
} from "./mapping-form";

const firstOfType = (categories: ImportCategory[], type: string): string =>
  categories.find(
    (category) => category.type === type && category.archivedAt === null
  )?.id ?? "";

const initialValues = (
  source: LocalCsv,
  accounts: ImportAccount[],
  categories: ImportCategory[],
  accountId: string | undefined
): ImportFormValues => {
  const { headers } = sampleCsv(source.text, source.delimiter, true);
  const active = accounts.filter((account) => account.archivedAt === null);
  const preselected =
    active.find((account) => account.id === accountId)?.id ?? null;
  return toFormValues({
    accountId: preselected,
    defaultExpenseCategoryId: firstOfType(categories, "expense"),
    defaultIncomeCategoryId: firstOfType(categories, "income"),
    mapping: guessImportMapping(headers, {
      delimiter: source.delimiter,
      hasHeaderRow: true,
    }),
    openingBalanceMode: "reject",
  });
};

const RecentImports = ({
  activeOrganizationId,
}: {
  activeOrganizationId: string;
}) => {
  const imports = useQuery(
    householdOrpc(activeOrganizationId).imports.list.queryOptions({
      input: { limit: 20 },
    })
  );
  if (imports.isPending) {
    return <Skeleton className="h-24 w-full" radius="2xl" />;
  }
  if (!imports.data || imports.data.length === 0) {
    return null;
  }
  return (
    <ListSection aria-label="Recent imports">
      <ListSectionHeader>Recent imports</ListSectionHeader>
      <List>
        {imports.data.map((item) => (
          <ListItem
            key={item.id}
            render={
              <Link params={{ importId: item.id }} to="/imports/$importId" />
            }
          >
            <ListItemContent>
              <ListItemTitle>{item.fileName}</ListItemTitle>
              <ListItemDescription>
                {item.accountName ?? "No account"} · {item.importedRows}{" "}
                imported · {item.invalidRows} rejected · {item.duplicateRows}{" "}
                duplicates
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing>
              <ImportStatusBadge status={item.status} />
            </ListItemTrailing>
          </ListItem>
        ))}
      </List>
    </ListSection>
  );
};

export const NewImportPage = ({
  accountId,
  activeOrganizationId,
}: {
  accountId?: string;
  activeOrganizationId: string;
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const accounts = useQuery(
    orpc.accounts.list.queryOptions({ input: { includeArchived: true } })
  );
  const household = useQuery(orpc.households.profile.queryOptions());
  const categories = useQuery(
    orpc.categories.list.queryOptions({ input: { includeArchived: true } })
  );
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<LocalCsv | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const start = useMutation({
    // The failure shows inline, beside the file.
    meta: { suppressErrorToast: true },
    mutationFn: async ({
      config,
      selected,
    }: {
      config: ImportConfig;
      selected: File;
    }) => {
      const uploaded = await uploadFile(asCsvUpload(selected));
      return orpc.imports.create.call({
        ...config,
        fileId: uploaded?.id ?? "",
      });
    },
    onError: (error) => setProblem(errorMessage(error)),
    onSuccess: async (created) => {
      await invalidate(queryClient, activeOrganizationId, "imports");
      await navigate({
        params: { importId: created.id },
        to: "/imports/$importId",
      });
    },
  });

  const chooseFile = async (selected: File | undefined) => {
    setProblem(null);
    setSource(null);
    setFile(null);
    if (!selected) {
      return;
    }
    if (!isCsvFile(selected)) {
      setProblem("Choose a .csv file exported from your bank or spreadsheet.");
      return;
    }
    try {
      const local = await readLocalCsv(selected);
      if (local.text.trim() === "") {
        setProblem("This file is empty.");
        return;
      }
      setFile(selected);
      setSource(local);
    } catch {
      setProblem("Couldn’t read this file.");
    }
  };

  const sample = useCallback(
    (delimiter: LocalCsv["delimiter"], hasHeaderRow: boolean) =>
      sampleCsv(source?.text ?? "", delimiter, hasHeaderRow),
    [source]
  );

  const startImport = async (config: ImportConfig) => {
    if (!file) {
      return;
    }
    setProblem(null);
    // `onError` shows the failure inline.
    await start.mutateAsync({ config, selected: file }).catch(() => null);
  };

  const ready = accounts.data && categories.data && household.data;
  const settingsError =
    accounts.isError || categories.isError || household.isError;

  return (
    <Page width="narrow">
      <PageHeader>
        <PageHeading>
          <PageTitle>Import transactions</PageTitle>
          <PageDescription>
            Bring in history from a bank or spreadsheet CSV. You’ll see every
            row before anything is added.
          </PageDescription>
        </PageHeading>
      </PageHeader>

      <div className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl p-4 dark:ring-1">
        <label
          className="flex items-center gap-2 text-sm font-medium"
          htmlFor="import-file"
        >
          <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
          CSV file
        </label>
        <Input
          accept=".csv,text/csv"
          id="import-file"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
          }}
          type="file"
        />
      </div>

      {problem ? (
        <Alert variant="error">
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}

      {source && !ready && settingsError ? (
        <Alert variant="error">
          <AlertTitle>Couldn’t load import settings</AlertTitle>
          <AlertDescription>Reload this page to try again.</AlertDescription>
        </Alert>
      ) : null}
      {source && !ready && !settingsError ? (
        <Skeleton className="h-24 w-full" radius="2xl" />
      ) : null}

      {source && ready ? (
        <MappingForm
          accounts={accounts.data}
          categories={categories.data}
          currency={household.data.defaultCurrency.code}
          initialValues={initialValues(
            source,
            accounts.data,
            categories.data,
            accountId
          )}
          key={source.fileName}
          onCancel={() => {
            setSource(null);
            setFile(null);
          }}
          onSubmit={startImport}
          sample={sample}
          submitLabel="Check all rows"
        />
      ) : null}

      <RecentImports activeOrganizationId={activeOrganizationId} />
    </Page>
  );
};
