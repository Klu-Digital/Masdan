import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

type SkipReason =
  RouterOutputs["transactions"]["bulkUpdate"]["skipped"][number]["reason"];

/**
 * Archive, restore and transfer deletion with their cache fallout in one
 * place. Archiving is soft, so its toast offers Undo instead of a confirm.
 */
export const useLedgerActions = (activeOrganizationId: string | null) => {
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const refreshLedger = () =>
    invalidate(queryClient, activeOrganizationId, "ledger");

  const restore = useMutation({
    mutationFn: (transactionId: string) =>
      orpc.transactions.restore.call({ transactionId }),
    onSuccess: async () => {
      await refreshLedger();
      toastManager.add({ title: "Transaction restored", type: "success" });
    },
  });

  const archive = useMutation({
    mutationFn: (transactionId: string) =>
      orpc.transactions.archive.call({ transactionId }),
    onSuccess: async (_, transactionId) => {
      await refreshLedger();
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
    mutationFn: (transferId: string) =>
      orpc.transfers.delete.call({ transferId }),
    onSuccess: async () => {
      await refreshLedger();
      toastManager.add({ title: "Transfer deleted", type: "success" });
    },
  });

  return { archive, deleteTransfer, restore };
};

export type LedgerActions = ReturnType<typeof useLedgerActions>;

export const useBulkUpdate = (activeOrganizationId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    householdOrpc(activeOrganizationId).transactions.bulkUpdate.mutationOptions(
      {
        // The dialog shows the failure inline.
        meta: { suppressErrorToast: true },
        onSuccess: async (result, input) => {
          await invalidate(queryClient, activeOrganizationId, "ledger");
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
      }
    )
  );
};
