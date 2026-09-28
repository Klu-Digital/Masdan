import { Button } from "@masdan/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@masdan/ui/components/dialog";
import { Field, FieldLabel } from "@masdan/ui/components/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useState } from "react";

import { useBulkUpdate } from "../use-ledger-actions";
import { MultiSelectFilter } from "./ledger-filters";

export const BulkEditDialog = ({
  activeOrganizationId,
  categories,
  tags,
  transactionIds,
  open,
  onOpenChange,
  onSaved,
}: {
  activeOrganizationId: string;
  categories: { id: string; name: string; archivedAt: Date | null }[];
  tags: { id: string; name: string; archivedAt: Date | null }[];
  transactionIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) => {
  const [categoryId, setCategoryId] = useState("");
  const [addTagIds, setAddTagIds] = useState<string[]>([]);
  const [removeTagIds, setRemoveTagIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const mutation = useBulkUpdate(activeOrganizationId);
  const tagOptions = tags
    .filter((tag) => tag.archivedAt === null)
    .map((tag) => ({ label: tag.name, value: tag.id }));
  const removeOptions = tags.map((tag) => ({ label: tag.name, value: tag.id }));
  const reset = () => {
    setConfirming(false);
    setCategoryId("");
    setAddTagIds([]);
    setRemoveTagIds([]);
    setErrorMessage("");
  };
  const close = (next: boolean) => {
    if (mutation.isPending) {
      return;
    }
    onOpenChange(next);
    if (!next) {
      reset();
    }
  };
  const submit = async () => {
    setErrorMessage("");
    try {
      await mutation.mutateAsync({
        transactionIds,
        ...(categoryId ? { categoryId } : {}),
        addTagIds,
        removeTagIds,
      });
      onOpenChange(false);
      reset();
      onSaved();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not update transactions";
      setErrorMessage(message);
    }
  };
  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {confirming
              ? `Update ${transactionIds.length} ${transactionIds.length === 1 ? "transaction" : "transactions"}?`
              : "Edit selected transactions"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "Split transactions keep their split categories."
              : "Choose a category or tags to change."}
          </DialogDescription>
        </DialogHeader>
        {confirming ? null : (
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="bulk-category">Category</FieldLabel>
                <Select
                  onValueChange={(value) => setCategoryId(value ?? "")}
                  value={categoryId}
                >
                  <SelectTrigger id="bulk-category">
                    <SelectValue>
                      {categories.find((item) => item.id === categoryId)
                        ?.name ?? "Keep current"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="">Keep current</SelectItem>
                    {categories
                      .filter((item) => item.archivedAt === null)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectPopup>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <MultiSelectFilter
                  label="Add tags"
                  selected={addTagIds}
                  options={tagOptions.filter(
                    (item) => !removeTagIds.includes(item.value)
                  )}
                  onChange={setAddTagIds}
                />
                <MultiSelectFilter
                  label="Remove tags"
                  selected={removeTagIds}
                  options={removeOptions.filter(
                    (item) => !addTagIds.includes(item.value)
                  )}
                  onChange={setRemoveTagIds}
                />
              </div>
            </div>
          </DialogPanel>
        )}
        {errorMessage ? (
          <p role="alert" className="text-destructive-foreground px-6 text-sm">
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            onClick={() => (confirming ? setConfirming(false) : close(false))}
            variant="secondary"
          >
            {confirming ? "Back" : "Cancel"}
          </Button>
          <Button
            disabled={
              !confirming &&
              !categoryId &&
              addTagIds.length === 0 &&
              removeTagIds.length === 0
            }
            loading={mutation.isPending}
            onClick={async () => {
              if (confirming) {
                await submit();
              } else {
                setConfirming(true);
              }
            }}
          >
            {confirming ? "Confirm update" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
