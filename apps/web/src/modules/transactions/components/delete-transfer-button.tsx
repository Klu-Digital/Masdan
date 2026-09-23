import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@masdan/ui/components/alert-dialog";
import { Button } from "@masdan/ui/components/button";

export const DeleteTransferButton = ({
  destination,
  loading = false,
  onConfirm,
  source,
}: {
  destination: string;
  loading?: boolean;
  onConfirm: () => void;
  source: string;
}) => (
  <AlertDialog>
    <AlertDialogTrigger
      onClick={(event) => event.stopPropagation()}
      render={<Button size="sm" variant="ghost" />}
    >
      Delete
    </AlertDialogTrigger>
    <AlertDialogPopup onClick={(event) => event.stopPropagation()}>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete transfer?</AlertDialogTitle>
        <AlertDialogDescription>
          Permanently remove the transfer from {source} to {destination} and
          reverse both account balances.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogClose render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button loading={loading} onClick={onConfirm} variant="destructive">
          Delete permanently
        </Button>
      </AlertDialogFooter>
    </AlertDialogPopup>
  </AlertDialog>
);
