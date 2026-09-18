import { TAG_COLORS } from "@masdan/api/tags/constants";
import type { TagColor } from "@masdan/api/tags/constants";
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
import type { ReactNode } from "react";
import { useState } from "react";
import { z } from "zod";

import { ColorSelector } from "@/components/color-selector";
import { client } from "@/utils/orpc";

import { invalidateTags, tagsQueryOptions } from "../queries";
import { TagBadge } from "./tag-badge";

interface Tag {
  archivedAt: Date | null;
  color: string;
  id: string;
  name: string;
}

const tagSchema = z.object({
  color: z.enum(TAG_COLORS),
  name: z.string().trim().min(1, "Name is required").max(80),
});

const tagColorValue = (color: string | undefined): TagColor =>
  color && TAG_COLORS.includes(color as TagColor)
    ? (color as TagColor)
    : "blue";

const TagFormDialog = ({
  activeOrganizationId,
  canCreate,
  canUpdate,
  tag,
}: {
  activeOrganizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
  tag?: Tag;
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const editing = tag !== undefined;
  const defaultValues: { color: TagColor; name: string } = {
    color: tagColorValue(tag?.color),
    name: tag?.name ?? "",
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        await (tag
          ? client.tags.update({ ...value, tagId: tag.id })
          : client.tags.create(value));
        await invalidateTags(queryClient, activeOrganizationId);
        formApi.reset();
        setOpen(false);
        toastManager.add({
          title: editing ? "Tag updated" : "Tag created",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} tag`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: tagSchema },
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
          tag ? (
            <Button size="sm" variant="outline">
              Edit
            </Button>
          ) : (
            <Button>Add tag</Button>
          )
        }
      />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit tag" : "Add tag"}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 px-6 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
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
          <form.Field name="color">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Color</FieldLabel>
                <ColorSelector
                  legend="Tag colors"
                  onValueChange={(value) => field.handleChange(value)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values}>
            {({ color, name }) => (
              <div className="bg-muted/40 border-border flex flex-col gap-2 rounded-lg border p-3">
                <span className="text-muted-foreground text-xs font-medium uppercase">
                  Preview
                </span>
                <TagBadge color={color} name={name || "Tag name"} />
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
                  {editing ? "Save changes" : "Create tag"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
};

export const TagManager = ({
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
  const tags = useQuery(tagsQueryOptions(activeOrganizationId));
  const [showArchived, setShowArchived] = useState(false);
  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.tags.restore({ tagId: id })
        : client.tags.archive({ tagId: id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { restore }) => {
      await invalidateTags(queryClient, activeOrganizationId);
      toastManager.add({
        title: restore ? "Tag restored" : "Tag archived",
        type: "success",
      });
    },
  });

  if (tags.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (tags.isError) {
    return <p className="text-muted-foreground">Could not load tags.</p>;
  }

  const visibleTags = showArchived
    ? tags.data
    : tags.data.filter((tag) => tag.archivedAt === null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Cross-cutting metadata for this household&apos;s transactions.
          </CardDescription>
        </div>
        {canCreate ? (
          <TagFormDialog
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
        {visibleTags.length === 0 ? (
          <Empty>
            <EmptyTitle>No tags found</EmptyTitle>
            <EmptyDescription>
              Add a tag to organize transactions across categories.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTags.map((tag) => {
                const archived = tag.archivedAt !== null;
                let statusAction: ReactNode = null;
                if (archived && canRestore) {
                  statusAction = (
                    <Button
                      loading={archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({ id: tag.id, restore: true })
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
                        archiveMutation.mutate({ id: tag.id, restore: false })
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Archive
                    </Button>
                  );
                }

                return (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <TagBadge color={tag.color} name={tag.name} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={archived ? "outline" : "default"}>
                        {archived ? "Archived" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <TagFormDialog
                          activeOrganizationId={activeOrganizationId}
                          canCreate={canCreate}
                          canUpdate={canUpdate}
                          tag={tag}
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
