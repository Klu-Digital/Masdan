import {
  CATEGORY_COLORS,
  CATEGORY_TYPES,
} from "@masdan/api/categories/constants";
import type {
  CategoryColor,
  CategoryType,
} from "@masdan/api/categories/constants";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@masdan/ui/components/popover";
import { Radio, RadioGroup } from "@masdan/ui/components/radio-group";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmojiPicker } from "frimousse";
import type { ReactNode } from "react";
import { useState } from "react";
import { z } from "zod";

import { ColorSelector } from "@/components/color-selector";
import { client } from "@/utils/orpc";

import { categoriesQueryOptions, invalidateCategories } from "../queries";
import { CategoryBadge } from "./category-badge";

interface Category {
  archivedAt: Date | null;
  color: string;
  id: string;
  icon: string;
  name: string;
  sortOrder: number;
  type: string;
}

const CATEGORY_TYPE_OPTIONS = [
  { label: "Expense", value: "expense" },
  { label: "Income", value: "income" },
] as const;

const categorySchema = z.object({
  color: z.enum(CATEGORY_COLORS),
  icon: z.string().trim().min(1, "Choose an emoji"),
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(CATEGORY_TYPES),
});

const categoryTypeLabel = (type: string) =>
  type === "expense" ? "Expense" : "Income";

const categoryColorValue = (color: string | undefined): CategoryColor =>
  color && CATEGORY_COLORS.includes(color as CategoryColor)
    ? (color as CategoryColor)
    : "blue";

const categoryTypeValue = (type: string | undefined): CategoryType =>
  type === "income" ? "income" : "expense";

const EmojiPickerControl = ({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) => (
  <Popover>
    <PopoverTrigger
      render={
        <Button
          aria-label="Choose emoji"
          className="justify-center"
          type="button"
          variant="outline"
        />
      }
    >
      <span className="text-xl">{value}</span>
    </PopoverTrigger>
    <PopoverPopup>
      <EmojiPicker.Root
        className="flex h-80 min-h-0 flex-col gap-2"
        onEmojiSelect={({ emoji }) => onValueChange(emoji)}
      >
        <EmojiPicker.Search
          aria-label="Search emoji"
          className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none"
          placeholder="Search emoji"
        />
        <EmojiPicker.Viewport className="min-h-0 flex-1 overflow-y-auto">
          <EmojiPicker.Loading>Loading emojis…</EmojiPicker.Loading>
          <EmojiPicker.Empty>No emoji found.</EmojiPicker.Empty>
          <EmojiPicker.List
            components={{
              CategoryHeader: ({ category: group, ...props }) => (
                <div
                  {...props}
                  className="text-muted-foreground px-1 py-2 text-xs font-medium"
                >
                  {group.label}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <button
                  {...props}
                  aria-label={emoji.label}
                  className="hover:bg-accent focus-visible:ring-ring rounded-md p-2 text-xl focus-visible:ring-2 focus-visible:outline-none"
                  type="button"
                >
                  {emoji.emoji}
                </button>
              ),
            }}
          />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </PopoverPopup>
  </Popover>
);

const CategoryFormDialog = ({
  activeOrganizationId,
  category,
  canCreate,
  canUpdate,
}: {
  activeOrganizationId: string;
  category?: Category;
  canCreate: boolean;
  canUpdate: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const editing = category !== undefined;

  const defaultValues: {
    color: CategoryColor;
    icon: string;
    name: string;
    type: CategoryType;
  } = {
    color: categoryColorValue(category?.color),
    icon: category?.icon ?? "🏷️",
    name: category?.name ?? "",
    type: categoryTypeValue(category?.type),
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        await (category
          ? client.categories.update({
              ...value,
              categoryId: category.id,
            })
          : client.categories.create(value));
        await invalidateCategories(queryClient, activeOrganizationId);
        formApi.reset();
        setOpen(false);
        toastManager.add({
          title: editing ? "Category updated" : "Category created",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} category`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: categorySchema },
  });

  if (editing && !canUpdate) {
    return null;
  }
  if (!editing && !canCreate) {
    return null;
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          category ? (
            <Button size="sm" variant="outline">
              Edit
            </Button>
          ) : (
            <Button>Add category</Button>
          )
        }
      />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit category" : "Add category"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 px-6 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div className="grid grid-cols-[auto_1fr] items-end gap-4">
            <form.Field name="icon">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Emoji</FieldLabel>
                  <EmojiPickerControl
                    onValueChange={(value) => field.handleChange(value)}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="name">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>
          </div>
          <form.Field name="type">
            {(field) => (
              <Field name={field.name}>
                <span className="text-sm font-medium">Type</span>
                <RadioGroup
                  aria-label="Category type"
                  className="grid grid-cols-2"
                  onClick={(event) => {
                    if (!(event.target instanceof HTMLElement)) {
                      return;
                    }
                    const value = event.target.closest<HTMLElement>(
                      "[data-category-type]"
                    )?.dataset.categoryType;
                    if (value === "expense" || value === "income") {
                      field.handleChange(value);
                    }
                  }}
                  onValueChange={(value) =>
                    field.handleChange(value as CategoryType)
                  }
                  value={field.state.value}
                >
                  {CATEGORY_TYPE_OPTIONS.map((option) => (
                    <label
                      className="border-input hover:bg-accent flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                      data-category-type={option.value}
                      key={option.value}
                    >
                      <Radio aria-label={option.label} value={option.value} />
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </Field>
            )}
          </form.Field>
          <form.Field name="color">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Color</FieldLabel>
                <ColorSelector
                  legend="Category colors"
                  onValueChange={(value) => field.handleChange(value)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => ({
              color: state.values.color,
              icon: state.values.icon,
              name: state.values.name,
            })}
          >
            {({ color, icon, name }) => (
              <div className="bg-muted/40 border-border flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-muted-foreground text-xs font-medium uppercase">
                  Preview
                </span>
                <CategoryBadge
                  color={color}
                  icon={icon}
                  name={name || "Category name"}
                />
              </div>
            )}
          </form.Subscribe>
          <DialogFooter variant="bare">
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  type="submit"
                >
                  {editing ? "Save changes" : "Create category"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
};

export const CategoryManager = ({
  activeOrganizationId,
  canArchive,
  canCreate,
  canRestore,
  canUpdate,
}: {
  activeOrganizationId: string;
  canArchive: boolean;
  canCreate: boolean;
  canRestore: boolean;
  canUpdate: boolean;
}) => {
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQueryOptions(activeOrganizationId));
  const [showArchived, setShowArchived] = useState(false);
  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.categories.restore({ categoryId: id })
        : client.categories.archive({ categoryId: id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { restore }) => {
      await invalidateCategories(queryClient, activeOrganizationId);
      toastManager.add({
        title: restore ? "Category restored" : "Category archived",
        type: "success",
      });
    },
  });

  if (categories.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (categories.isError) {
    return <p className="text-muted-foreground">Could not load categories.</p>;
  }

  const visibleCategories = showArchived
    ? categories.data
    : categories.data.filter((category) => category.archivedAt === null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Flat income and expense categories for this household.
          </CardDescription>
        </div>
        {canCreate ? (
          <CategoryFormDialog
            activeOrganizationId={activeOrganizationId}
            canCreate={canCreate}
            canUpdate={canUpdate}
          />
        ) : null}
      </CardHeader>
      <CardPanel>
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => setShowArchived((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>
        {visibleCategories.length === 0 ? (
          <Empty>
            <EmptyTitle>No categories found</EmptyTitle>
            <EmptyDescription>
              Add a category to classify household income and expenses.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCategories.map((category) => {
                const archived = category.archivedAt !== null;
                let statusAction: ReactNode = null;
                if (archived && canRestore) {
                  statusAction = (
                    <Button
                      loading={archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({
                          id: category.id,
                          restore: true,
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Restore
                    </Button>
                  );
                } else if (!archived && canArchive) {
                  statusAction = (
                    <Button
                      loading={archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({
                          id: category.id,
                          restore: false,
                        })
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Archive
                    </Button>
                  );
                }
                return (
                  <TableRow key={category.id}>
                    <TableCell>
                      <CategoryBadge
                        color={category.color}
                        icon={category.icon}
                        name={category.name}
                      />
                    </TableCell>
                    <TableCell>{categoryTypeLabel(category.type)}</TableCell>
                    <TableCell>
                      <Badge variant={archived ? "outline" : "default"}>
                        {archived ? "Archived" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <CategoryFormDialog
                          activeOrganizationId={activeOrganizationId}
                          canCreate={canCreate}
                          canUpdate={canUpdate}
                          category={category}
                        />
                        {statusAction}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  );
};
