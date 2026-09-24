import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type TransactionAttachment = Awaited<
  ReturnType<typeof client.attachments.list>
>[number];

/** Under the transaction's own key, so every ledger refresh of it refetches these too. */
export const attachmentsQueryOptions = (transactionId: string) =>
  queryOptions({
    // The section renders its own failure state.
    meta: { suppressErrorToast: true },
    queryFn: () => client.attachments.list({ transactionId }),
    queryKey: ["transaction", transactionId, "attachments"] as const,
  });

const KIB = 1024;
const MIB = KIB * KIB;

export const formatFileSize = (bytes: number | null): string => {
  if (bytes === null) {
    return "";
  }
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(1)} MB`;
  }
  if (bytes >= KIB) {
    return `${(bytes / KIB).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};
