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
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
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
import { client } from "@/utils/orpc";

import { invalidateTransactions } from "../queries";
import { Picker } from "./transaction-form";

export type Transfer = Awaited<ReturnType<typeof client.transfers.get>>;

const positiveAmount = z
  .string()
  .trim()
  .regex(/^\d+(?<fraction>\.\d{1,6})?$/u, "Use a positive amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

const transferSchema = z
  .object({
    destinationAccountId: z.string().uuid("Choose a destination account"),
    destinationAmount: positiveAmount,
    notes: z.string().max(2000),
    sourceAccountId: z.string().uuid("Choose a source account"),
    sourceAmount: positiveAmount,
    transactionDate: z.string().min(1, "Date is required"),
  })
  .superRefine((value, context) => {
    if (value.sourceAccountId === value.destinationAccountId) {
      context.addIssue({
        code: "custom",
        message: "Choose two different accounts",
        path: ["destinationAccountId"],
      });
    }
  });

type TransferFormValues = z.infer<typeof transferSchema>;

const today = () => new Date().toISOString().slice(0, 10);

// oxlint-disable-next-line complexity
export const TransferForm = ({
  activeOrganizationId,
  canCreate,
  canUpdate,
  inDialog = false,
  onSaved,
  transfer,
}: {
  activeOrganizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
  inDialog?: boolean;
  onSaved: (transferId: string) => void;
  transfer?: Transfer;
}) => {
  const queryClient = useQueryClient();
  const editing = transfer !== undefined;
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const defaultValues: TransferFormValues = {
    destinationAccountId: transfer?.destinationAccountId ?? "",
    destinationAmount: transfer?.destinationAmount ?? "",
    notes: transfer?.notes ?? "",
    sourceAccountId: transfer?.sourceAccountId ?? "",
    sourceAmount: transfer?.sourceAmount ?? "",
    transactionDate: transfer?.transactionDate ?? today(),
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        const saved = await (transfer
          ? client.transfers.update({ ...value, transferId: transfer.id })
          : client.transfers.create(value));
        await Promise.all([
          invalidateTransactions(queryClient, activeOrganizationId),
          invalidateAccounts(queryClient, activeOrganizationId),
          queryClient.invalidateQueries({ queryKey: ["transaction"] }),
        ]);
        formApi.reset();
        toastManager.add({
          title: editing ? "Transfer updated" : "Transfer created",
          type: "success",
        });
        onSaved(saved.id);
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} transfer`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: transferSchema },
  });

  if (editing && !canUpdate) {
    return null;
  }
  if (!editing && !canCreate) {
    return null;
  }
  if (accounts.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (accounts.isError) {
    return <p className="text-muted-foreground">Could not load accounts.</p>;
  }

  const accountItems = accounts.data
    .filter((account) => account.archivedAt === null)
    .map((account) => ({
      label: `${account.name} — ${account.currencyCode}`,
      value: account.id,
    }));

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

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="sourceAccountId">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>From account</FieldLabel>
              <Picker
                ariaLabel="Source account"
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
        <form.Subscribe selector={(state) => state.values.sourceAccountId}>
          {(sourceAccountId) => (
            <form.Field name="destinationAccountId">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>To account</FieldLabel>
                  <Picker
                    ariaLabel="Destination account"
                    items={accountItems.filter(
                      (item) => item.value !== sourceAccountId
                    )}
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
          )}
        </form.Subscribe>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form.Field name="sourceAmount">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>From amount</FieldLabel>
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
        <form.Field name="destinationAmount">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>To amount</FieldLabel>
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
      </div>

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

      <div className="flex justify-end">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button disabled={!canSubmit} loading={isSubmitting} type="submit">
              {editing ? "Save changes" : "Create transfer"}
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
        <CardTitle>{editing ? "Edit transfer" : "Add transfer"}</CardTitle>
        <CardDescription>
          Move money between two household accounts without recording income or
          expense.
        </CardDescription>
      </CardHeader>
      <CardPanel>{formContent}</CardPanel>
    </Card>
  );
};

export const TransferFormDialog = ({
  activeOrganizationId,
  canCreate = false,
  canUpdate = false,
  onOpenChange,
  open,
  transfer,
}: {
  activeOrganizationId: string;
  canCreate?: boolean;
  canUpdate?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  transfer?: Transfer;
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const editing = transfer !== undefined;
  const dialogOpen = open ?? uncontrolledOpen;
  const setDialogOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
      {open === undefined ? (
        <DialogTrigger render={<Button />}>
          {editing ? "Edit" : "Add transfer"}
        </DialogTrigger>
      ) : null}
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit transfer" : "Add transfer"}
          </DialogTitle>
          <DialogDescription>
            Move money between two household accounts.
          </DialogDescription>
        </DialogHeader>
        <TransferForm
          activeOrganizationId={activeOrganizationId}
          canCreate={canCreate}
          canUpdate={canUpdate}
          inDialog
          onSaved={() => setDialogOpen(false)}
          transfer={transfer}
        />
      </DialogPopup>
    </Dialog>
  );
};
