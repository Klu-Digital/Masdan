import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@masdan/ui/components/alert-dialog";
import { Button } from "@masdan/ui/components/button";

/**
 * Transfers hard-delete (both postings go), so this is the one ledger action
 * that asks first. Archiving a transaction is soft and offers Undo instead.
 */
export const DeleteTransferDialog = ({
  destination,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  source,
}: {
  destination: string;
  loading?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: string;
}) => (
  <AlertDialog onOpenChange={onOpenChange} open={open}>
    <AlertDialogPopup>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this transfer?</AlertDialogTitle>
        <AlertDialogDescription>
          The transfer from {source} to {destination} will be removed and both
          balances restored. This can’t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogClose render={<Button variant="secondary" />}>
          Cancel
        </AlertDialogClose>
        <Button loading={loading} onClick={onConfirm} variant="destructive">
          Delete transfer
        </Button>
      </AlertDialogFooter>
    </AlertDialogPopup>
  </AlertDialog>
);
