import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { addDays, nextDayOfMonth, previousDayOfMonth } from "@/lib/dates";
import { invalidateAllReminders } from "@/modules/reminders/queries";
import { FormActions } from "@/modules/transactions/components/transaction-form";
import { client } from "@/utils/orpc";

import { accountStatementsQueryOptions } from "../queries";

const decimal = /^-?\d+(?<fraction>\.\d{1,6})?$/u;
const nonNegative = /^\d+(?<fraction>\.\d{1,6})?$/u;

const statementSchema = z
  .object({
    dueDate: z.string(),
    minimumAmountDue: z
      .string()
      .regex(nonNegative, "Use a non-negative amount")
      .or(z.literal("")),
    periodEnd: z.string().min(1, "Choose the period’s last day"),
    periodStart: z.string().min(1, "Choose the period’s first day"),
    statementBalance: z.string().regex(decimal, "Enter the statement balance"),
    statementDate: z.string().min(1, "Choose the statement date"),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "The period must end on or after it starts",
    path: ["periodEnd"],
  });

type StatementValues = z.infer<typeof statementSchema>;

/** Pre-fills the cycle from the card's closing and due days when they're set. */
const defaultCycle = (
  card: { paymentDueDay: number | null; statementClosingDay: number | null },
  today: string
) => {
  const statementDate = card.statementClosingDay
    ? previousDayOfMonth(card.statementClosingDay, today)
    : today;
  return {
    dueDate: card.paymentDueDay
      ? nextDayOfMonth(card.paymentDueDay, addDays(statementDate, 1))
      : "",
    periodEnd: statementDate,
    periodStart: card.statementClosingDay
      ? addDays(
          previousDayOfMonth(
            card.statementClosingDay,
            addDays(statementDate, -1)
          ),
          1
        )
      : addDays(statementDate, -29),
    statementDate,
  };
};

const Errors = ({ errors }: { errors: ({ message?: string } | undefined)[] }) =>
  errors.map((error) => (
    <FieldError key={error?.message} match>
      {error?.message}
    </FieldError>
  ));

export const StatementComposer = ({
  card,
  onOpenChange,
  open,
  today,
}: {
  card: {
    currencyCode: string;
    id: string;
    name: string;
    paymentDueDay: number | null;
    statementClosingDay: number | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
  today: string;
}) => {
  const queryClient = useQueryClient();
  const form = useForm({
    defaultValues: {
      ...defaultCycle(card, today),
      minimumAmountDue: "",
      statementBalance: "",
    } as StatementValues,
    onSubmit: async ({ value }) => {
      try {
        await client.accounts.createStatement({
          ...value,
          accountId: card.id,
          dueDate: value.dueDate || null,
          minimumAmountDue: value.minimumAmountDue || null,
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: accountStatementsQueryOptions(card.id).queryKey,
          }),
          invalidateAllReminders(queryClient),
        ]);
        onOpenChange(false);
        toastManager.add({ title: "Statement recorded", type: "success" });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : "Could not record the statement",
          type: "error",
        });
      }
    },
    validators: { onSubmit: statementSchema },
  });

  return (
    <ResponsiveSheet
      description="Copy the figures from your issued statement. They’re kept as they were issued, even if card details change later."
      onOpenChange={onOpenChange}
      open={open}
      title={`Record ${card.name} statement`}
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
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="statementBalance">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Statement balance</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  // oxlint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  numeric
                  id={field.name}
                  inputMode="decimal"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="0.00"
                  value={field.state.value}
                />
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="minimumAmountDue">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Minimum due</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  numeric
                  id={field.name}
                  inputMode="decimal"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Optional"
                  value={field.state.value}
                />
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="statementDate">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Statement date</FieldLabel>
                <div className="w-full">
                  <DatePicker
                    id={field.name}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                </div>
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="dueDate">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Payment due</FieldLabel>
                <div className="w-full">
                  <DatePicker
                    id={field.name}
                    onValueChange={field.handleChange}
                    placeholder="Optional"
                    value={field.state.value}
                  />
                </div>
              </Field>
            )}
          </form.Field>
          <form.Field name="periodStart">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Period from</FieldLabel>
                <div className="w-full">
                  <DatePicker
                    id={field.name}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                </div>
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="periodEnd">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Period to</FieldLabel>
                <div className="w-full">
                  <DatePicker
                    id={field.name}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                </div>
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        </div>
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
                Save statement
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};
