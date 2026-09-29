import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";

import { useAppActions } from "@/components/app-actions";
import { useHousehold } from "@/hooks/use-household";
import { TransactionInspector } from "@/modules/transactions/components/inspector";
import { useLedgerActions } from "@/modules/transactions/use-ledger-actions";
import { householdOrpc, orNullIfMissing } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/transactions/$transactionId");

/**
 * A deep-linkable detail: the inspector opens over the ledger, and closing it
 * returns to the list with its filters intact.
 */
const TransactionDetailRoute = () => {
  const { transactionId } = routeApi.useParams();
  const navigate = routeApi.useNavigate();
  const { activeOrganizationId, can } = useHousehold();
  const { compose } = useAppActions();
  const actions = useLedgerActions(activeOrganizationId);
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    // Let the sheet finish leaving before the route unmounts it.
    window.setTimeout(() => {
      navigate({ search: (previous) => previous, to: "/transactions" });
    }, 240);
  };

  return (
    <TransactionInspector
      actions={actions}
      activeOrganizationId={activeOrganizationId}
      onEdit={(detail) => {
        close();
        compose(
          detail.transfer
            ? { transfer: detail.transfer, type: "transfer" }
            : { transaction: detail, type: "transaction" }
        );
      }}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
      open={open}
      permissions={{
        canArchive: can({ transaction: ["archive"] }),
        canRestore: can({ transaction: ["restore"] }),
        canUpdate: can({ transaction: ["update"] }),
      }}
      transactionId={transactionId}
    />
  );
};

/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/transactions/$transactionId")({
  component: TransactionDetailRoute,
  // A missing transaction renders its own state inside the inspector.
  loader: ({ context, params }) =>
    orNullIfMissing(
      context.queryClient.ensureQueryData(
        householdOrpc(
          context.activeOrganizationId
        ).transactions.get.queryOptions({
          input: { transactionId: params.transactionId },
        })
      )
    ),
  head: ({ loaderData }) => {
    let title = "Transaction";
    if (loaderData?.transfer) {
      title = "Transfer";
    } else if (loaderData?.categoryName) {
      title = loaderData.categoryName;
    }
    return { meta: [{ title }] };
  },
});
/* oxlint-enable sort-keys */
