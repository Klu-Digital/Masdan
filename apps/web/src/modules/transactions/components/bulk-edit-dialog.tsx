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
import { useState } from "react";

import { errorMessage as messageFor } from "@/utils/orpc";

import { CategoryPicker } from "../../categories/components/category-picker";
import { TagPicker } from "../../tags/components/tag-picker";
import { useBulkUpdate } from "../use-ledger-actions";

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
  categories: {
    archivedAt: Date | null;
    color: string;
    icon: string;
    id: string;
    name: string;
  }[];
  tags: {
    archivedAt: Date | null;
    color: string;
    id: string;
    name: string;
  }[];
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
  const activeCategories = categories.filter(
    (category) => category.archivedAt === null
  );
  const addOptions = tags.filter(
    (tag) => tag.archivedAt === null && !removeTagIds.includes(tag.id)
  );
  const removeOptions = tags.filter((tag) => !addTagIds.includes(tag.id));
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
      setErrorMessage(messageFor(error));
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
                <FieldLabel>Category</FieldLabel>
                <CategoryPicker
                  categories={activeCategories}
                  onValueChange={setCategoryId}
                  placeholder="Keep current"
                  showClear
                  value={categoryId}
                />
              </Field>
              <Field>
                <FieldLabel>Add tags</FieldLabel>
                <TagPicker
                  ariaLabel="Add tags"
                  onValueChange={setAddTagIds}
                  placeholder="Search tags"
                  tags={addOptions}
                  value={addTagIds}
                />
              </Field>
              <Field>
                <FieldLabel>Remove tags</FieldLabel>
                <TagPicker
                  ariaLabel="Remove tags"
                  onValueChange={setRemoveTagIds}
                  placeholder="Search tags"
                  tags={removeOptions}
                  value={removeTagIds}
                />
              </Field>
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
