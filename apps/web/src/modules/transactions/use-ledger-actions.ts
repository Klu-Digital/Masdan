import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { invalidateAccounts } from "@/modules/accounts/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions } from "./queries";

type SkipReason = Awaited<
  ReturnType<typeof client.transactions.bulkUpdate>
>["skipped"][number]["reason"];

const refreshLedger = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  Promise.all([
    invalidateTransactions(queryClient, activeOrganizationId),
    invalidateAccounts(queryClient, activeOrganizationId),
    queryClient.invalidateQueries({ queryKey: ["transaction"] }),
    queryClient.invalidateQueries({ queryKey: ["account"] }),
  ]);

/**
 * Archive, restore and transfer deletion with their cache fallout in one
 * place. Archiving is soft, so its toast offers Undo instead of a confirm.
 */
export const useLedgerActions = (activeOrganizationId: string | null) => {
  const queryClient = useQueryClient();

  const restore = useMutation({
    mutationFn: (transactionId: string) =>
      client.transactions.restore({ transactionId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await refreshLedger(queryClient, activeOrganizationId);
      toastManager.add({ title: "Transaction restored", type: "success" });
    },
  });

  const archive = useMutation({
    mutationFn: (transactionId: string) =>
      client.transactions.archive({ transactionId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, transactionId) => {
      await refreshLedger(queryClient, activeOrganizationId);
      toastManager.add({
        actionProps: {
          children: "Undo",
          onClick: () => restore.mutate(transactionId),
        },
        description: "It no longer counts toward balances.",
        title: "Transaction archived",
        type: "success",
      });
    },
  });

  const deleteTransfer = useMutation({
    mutationFn: (transferId: string) => client.transfers.delete({ transferId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await refreshLedger(queryClient, activeOrganizationId);
      toastManager.add({ title: "Transfer deleted", type: "success" });
    },
  });

  return { archive, deleteTransfer, restore };
};

export type LedgerActions = ReturnType<typeof useLedgerActions>;

export const useBulkUpdate = (activeOrganizationId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof client.transactions.bulkUpdate>[0]) =>
      client.transactions.bulkUpdate(input),
    onSuccess: async (result, input) => {
      await refreshLedger(queryClient, activeOrganizationId);
      const count = result.updated.length;
      const reasons: Record<SkipReason, [string, string]> = {
        archived: ["was archived", "were archived"],
        invalid: ["was invalid", "were invalid"],
        not_found: ["was not found", "were not found"],
        split: ["was a split transaction", "were split transactions"],
        transfer: ["was a transfer", "were transfers"],
      };
      const skipDescription = Object.entries(reasons)
        .map(([reason, [singular, plural]]) => {
          const n = result.skipped.filter(
            (item) => item.reason === reason
          ).length;
          return n ? `${n} ${n === 1 ? singular : plural}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const kept = result.categoryKept.length;
      const description = [
        skipDescription,
        kept
          ? `${kept} split ${kept === 1 ? "transaction kept its category" : "transactions kept their categories"}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      let type: "error" | "warning" | "success" = "success";
      if (count === 0) {
        type = "error";
      } else if (result.skipped.length > 0 || kept > 0) {
        type = "warning";
      }
      toastManager.add({
        description: description || undefined,
        title:
          result.skipped.length || kept
            ? `Updated ${count} of ${input.transactionIds.length}`
            : `Updated ${count} ${count === 1 ? "transaction" : "transactions"}`,
        type,
      });
    },
  });
};
