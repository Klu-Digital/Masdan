import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type TransactionImport = Awaited<ReturnType<typeof client.imports.get>>;
export type ImportRowsInput = Parameters<typeof client.imports.rows>[0];
export type ImportRow = Awaited<
  ReturnType<typeof client.imports.rows>
>["items"][number];

const POLL_INTERVAL_MS = 1500;

export const isImportProcessing = (status: string | undefined): boolean =>
  status === "validating" || status === "committing";

export const importsQueryKey = (activeOrganizationId: string | null) =>
  ["imports", activeOrganizationId] as const;

export const importsQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.imports.list({ limit: 20 }),
    queryKey: importsQueryKey(activeOrganizationId),
  });

export const importQueryOptions = (importId: string) =>
  queryOptions({
    queryFn: () => client.imports.get({ importId }),
    queryKey: ["import", importId] as const,
    refetchInterval: (query) =>
      isImportProcessing(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

export const importRowsQueryOptions = (input: ImportRowsInput) =>
  queryOptions({
    placeholderData: (previous) => previous,
    queryFn: () => client.imports.rows(input),
    queryKey: ["import", input.importId, "rows", input] as const,
  });

export const invalidateImport = (queryClient: QueryClient, importId: string) =>
  queryClient.invalidateQueries({ queryKey: ["import", importId] });
