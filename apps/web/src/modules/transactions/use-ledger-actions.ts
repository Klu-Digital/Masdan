import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateAccounts } from "@/modules/accounts/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions } from "./queries";

/**
 * Archive, restore and transfer deletion with their cache fallout in one
 * place. Archiving is soft, so its toast offers Undo instead of a confirm.
 */
export const useLedgerActions = (activeOrganizationId: string | null) => {
  const queryClient = useQueryClient();

  const refresh = () =>
    Promise.all([
      invalidateTransactions(queryClient, activeOrganizationId),
      invalidateAccounts(queryClient, activeOrganizationId),
      queryClient.invalidateQueries({ queryKey: ["transaction"] }),
      queryClient.invalidateQueries({ queryKey: ["account"] }),
    ]);

  const restore = useMutation({
    mutationFn: (transactionId: string) =>
      client.transactions.restore({ transactionId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await refresh();
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
      await refresh();
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
      await refresh();
      toastManager.add({ title: "Transfer deleted", type: "success" });
    },
  });

  return { archive, deleteTransfer, restore };
};

export type LedgerActions = ReturnType<typeof useLedgerActions>;
