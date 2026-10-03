import {
  Archive02Icon,
  ArchiveRestoreIcon,
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import { useState } from "react";

import type { Transaction } from "../types";
import type { LedgerActions } from "../use-ledger-actions";
import { DeleteTransferDialog } from "./delete-transfer-dialog";

export interface LedgerPermissions {
  canArchive: boolean;
  canRestore: boolean;
  canUpdate: boolean;
}

/** Contextual actions for one ledger row; renders nothing if none apply. */
export const TransactionMenu = ({
  actions,
  onEdit,
  permissions,
  transaction,
}: {
  actions: LedgerActions;
  onEdit: (transaction: Transaction) => void;
  permissions: LedgerPermissions;
  transaction: Transaction;
}) => {
  const [confirming, setConfirming] = useState(false);
  const { transfer } = transaction;
  const archived = transaction.archivedAt !== null;
  const canEdit =
    permissions.canUpdate &&
    !transaction.reconciliationSnapshotId &&
    (transfer !== null || !archived);
  const canArchive = !transfer && !archived && permissions.canArchive;
  const canRestore = !transfer && archived && permissions.canRestore;
  const canDelete = transfer !== null && permissions.canArchive;

  if (!(canEdit || canArchive || canRestore || canDelete)) {
    return null;
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label="Transaction actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          render={<Button size="icon-sm" variant="ghost" />}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </MenuTrigger>
        <MenuPopup
          align="end"
          className="min-w-44"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {canEdit ? (
            <MenuItem onClick={() => onEdit(transaction)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} />
              Edit
            </MenuItem>
          ) : null}
          {canRestore ? (
            <MenuItem onClick={() => actions.restore.mutate(transaction.id)}>
              <HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.8} />
              Restore
            </MenuItem>
          ) : null}
          {canArchive ? (
            <>
              {canEdit ? <MenuSeparator /> : null}
              <MenuItem onClick={() => actions.archive.mutate(transaction.id)}>
                <HugeiconsIcon icon={Archive02Icon} strokeWidth={1.8} />
                Archive
              </MenuItem>
            </>
          ) : null}
          {canDelete ? (
            <>
              {canEdit ? <MenuSeparator /> : null}
              <MenuItem
                onClick={() => setConfirming(true)}
                variant="destructive"
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                Delete transfer…
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {transfer ? (
        // Portal events bubble through React to the row, which would open the inspector.
        <span
          className="contents"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <DeleteTransferDialog
            destination={transfer.destinationAccount.name}
            loading={actions.deleteTransfer.isPending}
            onConfirm={() =>
              actions.deleteTransfer.mutate(transfer.id, {
                onSuccess: () => setConfirming(false),
              })
            }
            onOpenChange={setConfirming}
            open={confirming}
            source={transfer.sourceAccount.name}
          />
        </span>
      ) : null}
    </>
  );
};
