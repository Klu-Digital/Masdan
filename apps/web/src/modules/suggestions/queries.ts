import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type TransactionSuggestionResult = Awaited<
  ReturnType<typeof client.suggestions.forTransaction>
>;
export type ImportSuggestionSummary = Awaited<
  ReturnType<typeof client.suggestions.importSummary>
>;

/** Under the import's own key, so `invalidateImport` refreshes it too. */
export const importSuggestionSummaryQueryOptions = (importId: string) =>
  queryOptions({
    queryFn: () => client.suggestions.importSummary({ importId }),
    queryKey: ["import", importId, "suggestions"] as const,
  });
