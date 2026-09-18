import { TRANSACTION_PAID_STATUSES } from "@masdan/api/transactions/constants";
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
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { Radio, RadioGroup } from "@masdan/ui/components/radio-group";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import {
  accountsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { CategoryBadge } from "@/modules/categories/components/category-badge";
import { categoriesQueryOptions } from "@/modules/categories/queries";
import { tagsQueryOptions } from "@/modules/tags/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions, transactionQueryOptions } from "../queries";

type Transaction = Awaited<ReturnType<typeof client.transactions.get>>;
type Category = Awaited<ReturnType<typeof client.categories.list>>[number];

const transactionSchema = z.object({
  accountId: z.string().uuid("Choose an account"),
  amount: z
    .string()
    .trim()
    .regex(/^(?<whole>\d+)(?<fraction>\.\d{1,6})?$/u, "Use a positive amount")
    .refine(
      (value) => /[1-9]/u.test(value),
      "Amount must be greater than zero"
    ),
  categoryId: z.string().uuid("Choose a category"),
  notes: z.string().max(2000),
  paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
  tagIds: z.array(z.string().uuid()),
  transactionDate: z.string().min(1, "Date is required"),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

const today = () => new Date().toISOString().slice(0, 10);

interface PickerItem {
  label: string;
  value: string;
}

const Picker = ({
  ariaLabel,
  items,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  items: PickerItem[];
  onValueChange: (value: string) => void;
  value: string;
}) => (
  <Combobox
    items={items}
    onValueChange={(item: PickerItem | null) =>
      onValueChange(item?.value ?? "")
    }
    value={items.find((item) => item.value === value) ?? null}
  >
    <ComboboxInput
      aria-label={ariaLabel}
      placeholder={`Select ${ariaLabel.toLowerCase()}`}
    />
    <ComboboxPopup>
      <ComboboxEmpty>No matching option.</ComboboxEmpty>
      <ComboboxList>
        <ComboboxCollection>
          {(item: PickerItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxCollection>
      </ComboboxList>
    </ComboboxPopup>
  </Combobox>
);

const CategoryPicker = ({
  categories,
  onValueChange,
  value,
}: {
  categories: Category[];
  onValueChange: (value: string) => void;
  value: string;
}) => {
  const selectedCategory =
    categories.find((category) => category.id === value) ?? null;

  return (
    <Combobox
      itemToStringLabel={(item: Category) => item.name}
      items={categories}
      onValueChange={(item: Category | null) => onValueChange(item?.id ?? "")}
      value={selectedCategory}
    >
      <ComboboxInput aria-label="Category" placeholder="Select category" />
      <ComboboxPopup>
        <ComboboxEmpty>No matching category.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(category: Category) => (
              <ComboboxItem key={category.id} value={category}>
                <CategoryBadge
                  color={category.color}
                  icon={category.icon}
                  name={category.name}
                />
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
};

// oxlint-disable-next-line complexity
export const TransactionForm = ({
  activeOrganizationId,
  canCreate,
  canUpdate,
  inDialog = false,
  transaction,
  onSaved,
}: {
  activeOrganizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
  inDialog?: boolean;
  transaction?: Transaction;
  onSaved: (transactionId: string) => void;
}) => {
  const queryClient = useQueryClient();
  const editing = transaction !== undefined;
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const categories = useQuery(categoriesQueryOptions(activeOrganizationId));
  const tags = useQuery(tagsQueryOptions(activeOrganizationId));

  const defaultValues: TransactionFormValues = {
    accountId: transaction?.accountId ?? "",
    amount: transaction?.amount ?? "",
    categoryId: transaction?.categoryId ?? "",
    notes: transaction?.notes ?? "",
    paidStatus: transaction?.paidStatus ?? "paid",
    tagIds: transaction?.tags.map(({ id }) => id) ?? [],
    transactionDate: transaction?.transactionDate ?? today(),
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await (transaction
          ? client.transactions.update({
              ...value,
              transactionId: transaction.id,
            })
          : client.transactions.create(value));
        await Promise.all([
          invalidateTransactions(queryClient, activeOrganizationId),
          invalidateAccounts(queryClient, activeOrganizationId),
          queryClient.invalidateQueries({
            queryKey: transactionQueryOptions(saved.id).queryKey,
          }),
        ]);
        formApi.reset();
        toastManager.add({
          title: editing ? "Transaction updated" : "Transaction created",
          type: "success",
        });
        onSaved(saved.id);
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} transaction`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: transactionSchema },
  });

  if (editing && !canUpdate) {
    return null;
  }
  if (!editing && !canCreate) {
    return null;
  }
  if (accounts.isPending || categories.isPending || tags.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (accounts.isError || categories.isError || tags.isError) {
    return (
      <p className="text-muted-foreground">
        Could not load transaction options.
      </p>
    );
  }

  const accountItems = accounts.data
    .filter((account) => account.archivedAt === null)
    .map((account) => ({
      label: `${account.name} — ${account.currencyCode}`,
      value: account.id,
    }));
  const categoryItems = categories.data.filter(
    (category) =>
      category.archivedAt === null || category.id === transaction?.categoryId
  );
  const tagItems = tags.data.filter(
    (tag) =>
      tag.archivedAt === null ||
      transaction?.tags.some(({ id }) => id === tag.id)
  );

  const formContent = (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="transactionDate">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Date</FieldLabel>
            <DatePicker
              id={field.name}
              onValueChange={(value) => field.handleChange(value)}
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

      <form.Field name="categoryId">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel>Category</FieldLabel>
            <CategoryPicker
              categories={categoryItems}
              onValueChange={(value) => field.handleChange(value)}
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

      <form.Field name="notes">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
            <Textarea
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

      <form.Field name="accountId">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel>Account</FieldLabel>
            <Picker
              ariaLabel="Account"
              items={accountItems}
              onValueChange={(value) => field.handleChange(value)}
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

      <form.Field name="amount">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Amount</FieldLabel>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              id={field.name}
              inputMode="decimal"
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

      <form.Field name="paidStatus">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel>Status</FieldLabel>
            <RadioGroup
              aria-label="Paid status"
              onValueChange={(value) =>
                field.handleChange(value as TransactionFormValues["paidStatus"])
              }
              value={field.state.value}
            >
              {TRANSACTION_PAID_STATUSES.map((status) => (
                <label className="flex items-center gap-2 text-sm" key={status}>
                  <Radio value={status} />
                  {status === "paid" ? "Paid" : "Unpaid"}
                </label>
              ))}
            </RadioGroup>
          </Field>
        )}
      </form.Field>

      <form.Field name="tagIds">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel>Tags</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {tagItems.map((tag) => {
                const selected = field.state.value.includes(tag.id);
                return (
                  <Button
                    aria-pressed={selected}
                    key={tag.id}
                    onClick={() =>
                      field.handleChange(
                        selected
                          ? field.state.value.filter((id) => id !== tag.id)
                          : [...field.state.value, tag.id]
                      )
                    }
                    size="sm"
                    type="button"
                    variant={selected ? "default" : "outline"}
                  >
                    {tag.name}
                  </Button>
                );
              })}
            </div>
            {tagItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No active tags yet.
              </p>
            ) : null}
          </Field>
        )}
      </form.Field>

      {transaction?.archivedAt ? (
        <Badge variant="outline">Archived transactions cannot be edited.</Badge>
      ) : null}

      <div className="flex justify-end">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button disabled={!canSubmit} loading={isSubmitting} type="submit">
              {editing ? "Save changes" : "Create transaction"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );

  if (inDialog) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editing ? "Edit transaction" : "Add transaction"}
        </CardTitle>
        <CardDescription>
          {editing
            ? "Changes update the account balance immediately."
            : "Record household income or expense in the account's currency."}
        </CardDescription>
      </CardHeader>
      <CardPanel>{formContent}</CardPanel>
    </Card>
  );
};

export const TransactionFormDialog = ({
  activeOrganizationId,
  canCreate = false,
  canUpdate = false,
  onOpenChange,
  open,
  transaction,
}: {
  activeOrganizationId: string;
  canCreate?: boolean;
  canUpdate?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  transaction?: Transaction;
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const editing = transaction !== undefined;
  const dialogOpen = open ?? uncontrolledOpen;
  const setDialogOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
      {open === undefined ? (
        <DialogTrigger render={<Button />}>
          {editing ? "Edit" : "Add transaction"}
        </DialogTrigger>
      ) : null}
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes update the account balance immediately."
              : "Record household income or expense in the account&apos;s currency."}
          </DialogDescription>
        </DialogHeader>
        <TransactionForm
          activeOrganizationId={activeOrganizationId}
          canCreate={canCreate}
          canUpdate={canUpdate}
          inDialog
          onSaved={() => setDialogOpen(false)}
          transaction={transaction}
        />
      </DialogPopup>
    </Dialog>
  );
};
