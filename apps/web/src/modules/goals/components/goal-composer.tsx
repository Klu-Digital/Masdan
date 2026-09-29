import { positiveAmount } from "@masdan/api/shared/money";
import { AmountInput } from "@masdan/ui/components/amount-input";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { toastManager } from "@masdan/ui/components/toast";
import { moneyParts } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { AccountPicker } from "@/modules/accounts/components/account-picker";
import type { PickerAccount } from "@/modules/accounts/components/account-picker";
import {
  FormActions,
  trimDecimal,
} from "@/modules/transactions/components/transaction-form";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import type { Goal, GoalInput } from "../types";

export interface GoalAccount extends PickerAccount {
  accountClass: string;
  archivedAt: Date | null;
}

const goalFormSchema = z.object({
  accountId: z.string().uuid("Choose the account you save in"),
  name: z.string().trim().min(1, "Give the goal a name").max(80),
  targetAmount: positiveAmount,
  targetDate: z.string(),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

const toFormValues = (defaultAccountId: string, goal?: Goal): GoalFormValues =>
  goal
    ? {
        accountId: goal.accountId,
        name: goal.name,
        targetAmount: trimDecimal(goal.targetAmount),
        targetDate: goal.targetDate ?? "",
      }
    : {
        accountId: defaultAccountId,
        name: "",
        targetAmount: "",
        targetDate: "",
      };

const toInput = (values: GoalFormValues): GoalInput => ({
  accountId: values.accountId,
  name: values.name.trim(),
  targetAmount: values.targetAmount.trim(),
  targetDate: values.targetDate || null,
});

const FieldErrors = ({
  errors,
}: {
  errors: ({ message?: string } | undefined)[];
}) =>
  errors.map((error) => (
    <FieldError key={error?.message} match>
      {error?.message}
    </FieldError>
  ));

/** Create or edit a goal: what it is, how much, and which account holds it. */
export const GoalComposer = ({
  accounts,
  activeOrganizationId,
  goal,
  householdCurrency,
  onOpenChange,
  open,
}: {
  accounts: GoalAccount[];
  activeOrganizationId: string;
  goal?: Goal;
  householdCurrency: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const queryClient = useQueryClient();
  const editing = goal !== undefined;
  const { goals } = householdOrpc(activeOrganizationId);
  const onSuccess = async (_: unknown, { name }: { name: string }) => {
    await invalidate(queryClient, activeOrganizationId, "goals");
    onOpenChange(false);
    toastManager.add({
      title: editing ? "Goal updated" : `${name} added`,
      type: "success",
    });
  };
  const create = useMutation(goals.create.mutationOptions({ onSuccess }));
  const update = useMutation(goals.update.mutationOptions({ onSuccess }));
  // An archived account stays pickable only for the goal that already uses it.
  const choices = accounts.filter(
    (account) =>
      account.accountClass === "asset" &&
      (account.archivedAt === null || account.id === goal?.accountId)
  );
  const defaultAccountId = choices.length === 1 ? (choices[0]?.id ?? "") : "";

  const form = useForm({
    defaultValues: toFormValues(defaultAccountId, goal),
    onSubmit: async ({ value }) => {
      const input = toInput(value);
      // The mutation cache toasts the failure; the form keeps its values.
      await (
        goal
          ? update.mutateAsync({ ...input, goalId: goal.id })
          : create.mutateAsync(input)
      ).catch(() => null);
    },
    validators: { onSubmit: goalFormSchema },
  });

  return (
    <ResponsiveSheet
      description="Progress is the balance of the account you save in."
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit goal" : "New savings goal"}
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
        <form.Subscribe selector={(state) => state.values.accountId}>
          {(accountId) => {
            const currency =
              choices.find((account) => account.id === accountId)
                ?.currencyCode ?? householdCurrency;
            return (
              <form.Field name="targetAmount">
                {(field) => (
                  <Field className="items-stretch" name={field.name}>
                    <FieldLabel className="sr-only" htmlFor={field.name}>
                      Target amount
                    </FieldLabel>
                    <AmountInput
                      currencySymbol={moneyParts(0, currency).currency}
                      id={field.name}
                      invalid={field.state.meta.errors.length > 0}
                      onBlur={field.handleBlur}
                      onValueChange={field.handleChange}
                      value={field.state.value}
                    />
                    <div className="flex justify-center">
                      <FieldErrors errors={field.state.meta.errors} />
                    </div>
                  </Field>
                )}
              </form.Field>
            );
          }}
        </form.Subscribe>

        <form.Field name="name">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. Emergency fund"
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Field name="accountId">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>Saved in</FieldLabel>
              <div className="w-full">
                <AccountPicker
                  accounts={choices}
                  aria-invalid={field.state.meta.errors.length > 0}
                  ariaLabel="Saved in"
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </div>
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Field name="targetDate">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Target date</FieldLabel>
              <div className="flex w-full items-center gap-2">
                <div className="flex-1">
                  <DatePicker
                    id={field.name}
                    onValueChange={field.handleChange}
                    placeholder="No target date"
                    value={field.state.value}
                  />
                </div>
                {field.state.value ? (
                  <Button
                    onClick={() => field.handleChange("")}
                    size="sm"
                    variant="ghost"
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
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
                {editing ? "Save" : "Add goal"}
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};
