import {
  Archive02Icon,
  ArchiveRestoreIcon,
  Folder02Icon,
  Invoice02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CATEGORY_COLORS,
  CATEGORY_TYPES,
} from "@masdan/api/categories/constants";
import type {
  CategoryColor,
  CategoryType,
} from "@masdan/api/categories/constants";
import { Amount } from "@masdan/ui/components/amount";
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
import { IconTile } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
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
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@masdan/ui/components/popover";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { toastManager } from "@masdan/ui/components/toast";
import { toNumber } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmojiPicker } from "frimousse";
import { useState } from "react";
import { z } from "zod";

import { ColorSelector } from "@/components/color-selector";
import { startOfMonth, toIsoDate } from "@/lib/dates";
import { FormActions } from "@/modules/transactions/components/transaction-form";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

interface Category {
  archivedAt: Date | null;
  color: string;
  id: string;
  icon: string;
  name: string;
  sortOrder: number;
  type: string;
}

const categorySchema = z.object({
  color: z.enum(CATEGORY_COLORS),
  icon: z.string().trim().min(1, "Choose an emoji"),
  name: z.string().trim().min(1, "Give the category a name").max(80),
  type: z.enum(CATEGORY_TYPES),
});

const colorValue = (color: string | undefined): CategoryColor =>
  color && CATEGORY_COLORS.includes(color as CategoryColor)
    ? (color as CategoryColor)
    : "blue";

const initialType = (
  category: Category | undefined,
  fallback: CategoryType
): CategoryType => {
  if (!category) {
    return fallback;
  }
  return category.type === "income" ? "income" : "expense";
};

const EmojiField = ({
  color,
  onValueChange,
  value,
}: {
  color: string;
  onValueChange: (value: string) => void;
  value: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label={`Emoji: ${value}. Change`}
            className="focus-visible:ring-ring/50 rounded-2xl transition-transform duration-150 outline-none hover:scale-105 focus-visible:ring-3 active:scale-95 motion-reduce:hover:scale-100"
            type="button"
          />
        }
      >
        <IconTile size="xl" tint={color}>
          {value}
        </IconTile>
      </PopoverTrigger>
      <PopoverPopup align="start" inset="tight">
        <EmojiPicker.Root
          className="flex h-80 min-h-0 w-72 flex-col gap-2"
          onEmojiSelect={({ emoji }) => {
            onValueChange(emoji);
            setOpen(false);
          }}
        >
          <EmojiPicker.Search
            aria-label="Search emoji"
            className="border-input bg-background focus:border-ring h-9 rounded-lg border px-3 text-sm outline-none"
            placeholder="Search emoji"
          />
          <EmojiPicker.Viewport className="min-h-0 flex-1 overflow-y-auto">
            <EmojiPicker.Loading className="text-muted-foreground p-4 text-xs">
              Loading…
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="text-muted-foreground p-4 text-xs">
              No emoji found.
            </EmojiPicker.Empty>
            <EmojiPicker.List
              components={{
                CategoryHeader: ({ category: group, ...props }) => (
                  <div
                    {...props}
                    className="bg-popover text-muted-foreground px-1 pt-2 pb-1 text-xs font-medium"
                  >
                    {group.label}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    {...props}
                    aria-label={emoji.label}
                    className="data-[active]:bg-accent focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-md text-xl outline-none focus-visible:ring-3"
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
};

const CategoryComposer = ({
  activeOrganizationId,
  category,
  defaultType,
  onOpenChange,
  open,
}: {
  activeOrganizationId: string;
  category?: Category;
  defaultType: CategoryType;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const queryClient = useQueryClient();
  const editing = category !== undefined;
  const { categories } = householdOrpc(activeOrganizationId);
  const onSuccess = async (_: unknown, { name }: { name: string }) => {
    await invalidate(queryClient, activeOrganizationId, "categories");
    onOpenChange(false);
    toastManager.add({
      title: editing ? "Category updated" : `${name.trim()} added`,
      type: "success",
    });
  };
  const create = useMutation(categories.create.mutationOptions({ onSuccess }));
  const update = useMutation(categories.update.mutationOptions({ onSuccess }));
  const form = useForm({
    defaultValues: {
      color: colorValue(category?.color),
      icon: category?.icon ?? "🏷️",
      name: category?.name ?? "",
      type: initialType(category, defaultType),
    },
    onSubmit: async ({ value }) => {
      // The mutation cache toasts the failure; the form keeps its values.
      await (
        category
          ? update.mutateAsync({ ...value, categoryId: category.id })
          : create.mutateAsync(value)
      ).catch(() => null);
    },
    validators: { onSubmit: categorySchema },
  });

  return (
    <ResponsiveSheet
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit category" : "New category"}
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
        <div className="flex items-end gap-4">
          <form.Subscribe selector={(state) => state.values.color}>
            {(color) => (
              <form.Field name="icon">
                {(field) => (
                  <EmojiField
                    color={color}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="name">
            {(field) => (
              <Field className="flex-1" name={field.name}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={!editing}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="e.g. Groceries"
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
              <FieldLabel>Used for</FieldLabel>
              <Tabs
                className="w-full"
                onValueChange={(value) =>
                  field.handleChange(value as CategoryType)
                }
                value={field.state.value}
              >
                <TabsList aria-label="Category type" className="w-full">
                  <TabsTab value="expense">Expenses</TabsTab>
                  <TabsTab value="income">Income</TabsTab>
                </TabsList>
              </Tabs>
            </Field>
          )}
        </form.Field>
        <form.Field name="color">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>Color</FieldLabel>
              <ColorSelector
                legend="Category color"
                onValueChange={(value: CategoryColor) =>
                  field.handleChange(value)
                }
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
                {editing ? "Save" : "Add category"}
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};

export const CategoryManager = ({
  activeOrganizationId,
  canArchive,
  canCreate,
  canRestore,
  canUpdate,
  currency,
  today = toIsoDate(new Date()),
}: {
  activeOrganizationId: string;
  canArchive: boolean;
  canCreate: boolean;
  canRestore: boolean;
  canUpdate: boolean;
  /** When known, rows show this month's total in the household currency. */
  currency?: string;
  today?: string;
}) => {
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const categories = useQuery(
    orpc.categories.list.queryOptions({ input: { includeArchived: true } })
  );
  const summary = useQuery(
    orpc.transactions.summary.queryOptions({
      enabled: currency !== undefined,
      input: { dateFrom: startOfMonth(today), dateTo: today },
      meta: { suppressErrorToast: true },
      placeholderData: keepPreviousData,
      retry: false,
    })
  );
  const [type, setType] = useState<CategoryType>("expense");
  const [showArchived, setShowArchived] = useState(false);
  const [composer, setComposer] = useState<{
    category?: Category;
    key: number;
    open: boolean;
  } | null>(null);

  const archive = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? orpc.categories.restore.call({ categoryId: id })
        : orpc.categories.archive.call({ categoryId: id }),
    onSuccess: async (_, { id, restore }) => {
      await invalidate(queryClient, activeOrganizationId, "categories");
      toastManager.add({
        actionProps: restore
          ? undefined
          : {
              children: "Undo",
              onClick: () => archive.mutate({ id, restore: true }),
            },
        description: restore
          ? undefined
          : "Past transactions keep it; new ones can’t use it.",
        title: restore ? "Category restored" : "Category archived",
        type: "success",
      });
    },
  });

  const spending = new Map(
    (summary.data?.categories ?? [])
      .filter((row) => row.currencyCode === currency)
      .map((row) => [row.categoryId, row])
  );

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Categories</PageTitle>
        <PageDescription>
          How income and spending are grouped across the household.
        </PageDescription>
      </PageHeading>
      {canCreate ? (
        <PageActions>
          <Button onClick={() => setComposer({ key: Date.now(), open: true })}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New category
          </Button>
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (categories.isPending) {
    return (
      <Page width="narrow">
        {header}
        <Skeleton className="h-8 w-56" radius="lg" />
        <Skeleton className="h-80 w-full" radius="2xl" />
      </Page>
    );
  }
  if (categories.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load categories</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
        </Empty>
      </Page>
    );
  }

  const ofType = categories.data.filter((category) => category.type === type);
  const active = ofType.filter((category) => category.archivedAt === null);
  const archived = ofType.filter((category) => category.archivedAt !== null);
  const counts = {
    expense: categories.data.filter(
      (category) => category.type === "expense" && !category.archivedAt
    ).length,
    income: categories.data.filter(
      (category) => category.type === "income" && !category.archivedAt
    ).length,
  };

  const row = (category: Category) => {
    const isArchived = category.archivedAt !== null;
    const spent = spending.get(category.id);
    return (
      <ListItem
        interactive={canUpdate && !isArchived}
        key={category.id}
        onClick={
          canUpdate && !isArchived
            ? () => setComposer({ category, key: Date.now(), open: true })
            : undefined
        }
      >
        <ListItemLeading>
          <IconTile tint={category.color}>{category.icon}</IconTile>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>
            {category.name}
            {isArchived ? <Badge variant="outline">Archived</Badge> : null}
          </ListItemTitle>
          {spent && currency ? (
            <ListItemDescription>
              <Amount currency={currency} value={toNumber(spent.total)} /> this
              month · {spent.count} {spent.count === 1 ? "entry" : "entries"}
            </ListItemDescription>
          ) : null}
        </ListItemContent>
        <ListItemTrailing>
          <Menu>
            <MenuTrigger
              aria-label={`${category.name} actions`}
              onClick={(event) => event.stopPropagation()}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-48">
              <MenuItem
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      categoryIds: [category.id],
                    }}
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
                    setComposer({ category, key: Date.now(), open: true })
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
                  onClick={() =>
                    archive.mutate({ id: category.id, restore: false })
                  }
                >
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={1.8} />
                  Archive
                </MenuItem>
              ) : null}
              {canRestore && isArchived ? (
                <MenuItem
                  onClick={() =>
                    archive.mutate({ id: category.id, restore: true })
                  }
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
      <Tabs
        onValueChange={(value) => setType(value as CategoryType)}
        value={type}
      >
        <TabsList aria-label="Category type">
          <TabsTab value="expense">Expenses · {counts.expense}</TabsTab>
          <TabsTab value="income">Income · {counts.income}</TabsTab>
        </TabsList>
      </Tabs>

      {active.length === 0 ? (
        <Empty size="compact">
          <EmptyMedia>
            <HugeiconsIcon icon={Folder02Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>
            No {type === "expense" ? "expense" : "income"} categories
          </EmptyTitle>
          <EmptyDescription>
            Categories make spending and income easy to read at a glance.
          </EmptyDescription>
          {canCreate ? (
            <EmptyContent>
              <Button
                onClick={() => setComposer({ key: Date.now(), open: true })}
                variant="secondary"
              >
                Add a category
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <List
          aria-label={
            type === "expense" ? "Expense categories" : "Income categories"
          }
        >
          {active.map(row)}
        </List>
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
            <List aria-label="Archived categories">{archived.map(row)}</List>
          ) : null}
        </div>
      ) : null}

      {composer ? (
        <CategoryComposer
          activeOrganizationId={activeOrganizationId}
          category={composer.category}
          defaultType={type}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
        />
      ) : null}
    </Page>
  );
};
