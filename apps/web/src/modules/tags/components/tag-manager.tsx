import {
  Archive02Icon,
  ArchiveRestoreIcon,
  Invoice02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TAG_COLORS } from "@masdan/api/tags/constants";
import type { TagColor } from "@masdan/api/tags/constants";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { ColorSelector } from "@/components/color-selector";
import { FormActions } from "@/modules/transactions/components/transaction-form";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { client } from "@/utils/orpc";

import { invalidateTags, tagsQueryOptions } from "../queries";

interface Tag {
  archivedAt: Date | null;
  color: string;
  id: string;
  name: string;
}

const tagSchema = z.object({
  color: z.enum(TAG_COLORS),
  name: z.string().trim().min(1, "Give the tag a name").max(80),
});

const colorValue = (color: string | undefined): TagColor =>
  color && TAG_COLORS.includes(color as TagColor)
    ? (color as TagColor)
    : "blue";

const TagComposer = ({
  activeOrganizationId,
  onOpenChange,
  open,
  tag,
}: {
  activeOrganizationId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tag?: Tag;
}) => {
  const queryClient = useQueryClient();
  const editing = tag !== undefined;
  const form = useForm({
    defaultValues: { color: colorValue(tag?.color), name: tag?.name ?? "" },
    onSubmit: async ({ value }) => {
      try {
        await (tag
          ? client.tags.update({ ...value, tagId: tag.id })
          : client.tags.create(value));
        await invalidateTags(queryClient, activeOrganizationId);
        onOpenChange(false);
        toastManager.add({
          title: editing ? "Tag updated" : `${value.name.trim()} added`,
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} the tag`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: tagSchema },
  });

  return (
    <ResponsiveSheet
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit tag" : "New tag"}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
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
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={!editing}
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. Vacation 2026"
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
                legend="Tag color"
                onValueChange={(value: TagColor) => field.handleChange(value)}
                value={field.state.value}
              />
            </Field>
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <FormActions>
              <Button onClick={() => onOpenChange(false)} variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={!canSubmit}
                loading={isSubmitting}
                type="submit"
              >
                {editing ? "Save" : "Add tag"}
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};

/**
 * Tags cut across categories — a trip, a project, a person. Kept as a plain
 * list: a colour, a name, and a way into the transactions that carry it.
 */
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
  const [composer, setComposer] = useState<{
    key: number;
    open: boolean;
    tag?: Tag;
  } | null>(null);

  const archive = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.tags.restore({ tagId: id })
        : client.tags.archive({ tagId: id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { id, restore }) => {
      await invalidateTags(queryClient, activeOrganizationId);
      toastManager.add({
        actionProps: restore
          ? undefined
          : {
              children: "Undo",
              onClick: () => archive.mutate({ id, restore: true }),
            },
        title: restore ? "Tag restored" : "Tag archived",
        type: "success",
      });
    },
  });

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Tags</PageTitle>
        <PageDescription>
          Labels that cut across categories — a trip, a project, a person.
        </PageDescription>
      </PageHeading>
      {canCreate ? (
        <PageActions>
          <Button onClick={() => setComposer({ key: Date.now(), open: true })}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New tag
          </Button>
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (tags.isPending) {
    return (
      <Page width="narrow">
        {header}
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (tags.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load tags</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }

  const active = tags.data.filter((tag) => tag.archivedAt === null);
  const archived = tags.data.filter((tag) => tag.archivedAt !== null);

  const row = (tag: Tag) => {
    const isArchived = tag.archivedAt !== null;
    return (
      <ListItem
        className="min-h-12"
        interactive={canUpdate && !isArchived}
        key={tag.id}
        onClick={
          canUpdate && !isArchived
            ? () => setComposer({ key: Date.now(), open: true, tag })
            : undefined
        }
      >
        <ListItemLeading>
          <span className="flex size-7 items-center justify-center">
            <ColorDot className="size-3" tint={tag.color} />
          </span>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>
            {tag.name}
            {isArchived ? <Badge variant="outline">Archived</Badge> : null}
          </ListItemTitle>
        </ListItemContent>
        <ListItemTrailing>
          <Menu>
            <MenuTrigger
              aria-label={`${tag.name} actions`}
              onClick={(event) => event.stopPropagation()}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-48">
              <MenuItem
                render={
                  <Link
                    search={{ ...DEFAULT_TRANSACTION_SEARCH, tagIds: [tag.id] }}
                    to="/transactions"
                  />
                }
              >
                <HugeiconsIcon icon={Invoice02Icon} strokeWidth={1.8} />
                View transactions
              </MenuItem>
              {canUpdate && !isArchived ? (
                <MenuItem
                  onClick={() =>
                    setComposer({ key: Date.now(), open: true, tag })
                  }
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} />
                  Edit
                </MenuItem>
              ) : null}
              {(canArchive && !isArchived) || (canRestore && isArchived) ? (
                <MenuSeparator />
              ) : null}
              {canArchive && !isArchived ? (
                <MenuItem
                  onClick={() => archive.mutate({ id: tag.id, restore: false })}
                >
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={1.8} />
                  Archive
                </MenuItem>
              ) : null}
              {canRestore && isArchived ? (
                <MenuItem
                  onClick={() => archive.mutate({ id: tag.id, restore: true })}
                >
                  <HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.8} />
                  Restore
                </MenuItem>
              ) : null}
            </MenuPopup>
          </Menu>
        </ListItemTrailing>
      </ListItem>
    );
  };

  return (
    <Page width="narrow">
      {header}
      {active.length === 0 ? (
        <Empty size="compact">
          <EmptyMedia>
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No tags yet</EmptyTitle>
          <EmptyDescription>
            Tag transactions to follow a trip or project across categories.
          </EmptyDescription>
          {canCreate ? (
            <EmptyContent>
              <Button
                onClick={() => setComposer({ key: Date.now(), open: true })}
                variant="secondary"
              >
                Add a tag
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <List aria-label="Tags">{active.map(row)}</List>
      )}
      {archived.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Button
            aria-expanded={showArchived}
            className="self-start"
            onClick={() => setShowArchived((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showArchived
              ? "Hide archived"
              : `Show ${archived.length} archived`}
          </Button>
          {showArchived ? (
            <List aria-label="Archived tags">{archived.map(row)}</List>
          ) : null}
        </div>
      ) : null}
      {composer ? (
        <TagComposer
          activeOrganizationId={activeOrganizationId}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
          tag={composer.tag}
        />
      ) : null}
    </Page>
  );
};
