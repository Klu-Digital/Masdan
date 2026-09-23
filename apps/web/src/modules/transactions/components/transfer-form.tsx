import { ArrowUpDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AmountInput } from "@masdan/ui/components/amount-input";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { IconTile } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { formatMoney, moneyParts } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { householdToday } from "@/lib/household-date";
import { AccountPicker } from "@/modules/accounts/components/account-picker";
import { accountKind, accountTint } from "@/modules/accounts/kinds";
import {
  accountsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions } from "../queries";
import { FormActions, trimDecimal } from "./transaction-form";
import type { FormActionState } from "./transaction-form";

export type Transfer = Awaited<ReturnType<typeof client.transfers.get>>;

const positiveAmount = z
  .string()
  .trim()
  .regex(/^\d+(?<fraction>\.\d{1,6})?$/u, "Enter an amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

const transferSchema = z
  .object({
    destinationAccountId: z.string().uuid("Choose where the money goes"),
    destinationAmount: z.string(),
    notes: z.string().max(2000),
    sourceAccountId: z.string().uuid("Choose where the money comes from"),
    sourceAmount: positiveAmount,
    transactionDate: z.string().min(1, "Choose a date"),
  })
  .superRefine((value, context) => {
    if (
      value.sourceAccountId &&
      value.sourceAccountId === value.destinationAccountId
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose two different accounts",
        path: ["destinationAccountId"],
      });
    }
  });

type TransferFormValues = z.infer<typeof transferSchema>;

const NO_SUGGESTIONS: AmountSuggestion[] = [];

export interface AmountSuggestion {
  amount: string;
  label: string;
}

// oxlint-disable-next-line complexity
export const TransferForm = ({
  actions,
  activeOrganizationId,
  destinationAccountId,
  lockDestination = false,
  onSaved,
  sourceAccountId,
  suggestions = NO_SUGGESTIONS,
  timezone,
  transfer,
}: {
  actions: (state: FormActionState) => ReactNode;
  activeOrganizationId: string;
  destinationAccountId?: string;
  /** Paying a card: the card is fixed and only asset accounts can pay it. */
  lockDestination?: boolean;
  onSaved: (transferId: string) => void;
  sourceAccountId?: string;
  suggestions?: AmountSuggestion[];
  timezone: string;
  transfer?: Transfer;
}) => {
  const queryClient = useQueryClient();
  const editing = transfer !== undefined;
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const activeAccounts =
    accounts.data?.filter((account) => account.archivedAt === null) ?? [];

  const defaultValues: TransferFormValues = {
    destinationAccountId:
      transfer?.destinationAccountId ?? destinationAccountId ?? "",
    destinationAmount: trimDecimal(transfer?.destinationAmount),
    notes: transfer?.notes ?? "",
    sourceAccountId: transfer?.sourceAccountId ?? sourceAccountId ?? "",
    sourceAmount: trimDecimal(transfer?.sourceAmount),
    transactionDate: transfer?.transactionDate ?? householdToday(timezone),
  };

  const currencyOf = (accountId: string) =>
    activeAccounts.find((account) => account.id === accountId)?.currencyCode ??
    null;

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      const sameCurrency =
        currencyOf(value.sourceAccountId) ===
        currencyOf(value.destinationAccountId);
      const destinationAmount = sameCurrency
        ? value.sourceAmount
        : value.destinationAmount;
      if (!positiveAmount.safeParse(destinationAmount).success) {
        formApi.setFieldMeta("destinationAmount", (meta) => ({
          ...meta,
          errorMap: { onSubmit: [{ message: "Enter the amount received" }] },
        }));
        return;
      }
      const payload = { ...value, destinationAmount };
      try {
        const saved = await (transfer
          ? client.transfers.update({ ...payload, transferId: transfer.id })
          : client.transfers.create(payload));
        await Promise.all([
          invalidateTransactions(queryClient, activeOrganizationId),
          invalidateAccounts(queryClient, activeOrganizationId),
          queryClient.invalidateQueries({ queryKey: ["transaction"] }),
          queryClient.invalidateQueries({ queryKey: ["account"] }),
        ]);
        formApi.reset();
        toastManager.add({
          title: editing ? "Transfer updated" : "Transfer recorded",
          type: "success",
        });
        onSaved(saved.id);
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "record"} this transfer`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: transferSchema },
  });

  if (accounts.isPending) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <Skeleton className="mx-auto h-14 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (accounts.isError) {
    return (
      <p className="text-muted-foreground py-6 text-center">
        Couldn’t load your accounts. Close this and try again.
      </p>
    );
  }

  const sourceChoices = lockDestination
    ? activeAccounts.filter((account) => account.accountClass === "asset")
    : activeAccounts;
  const lockedDestination = lockDestination
    ? activeAccounts.find((account) => account.id === destinationAccountId)
    : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.values.sourceAccountId}>
        {(source) => {
          const currency =
            currencyOf(source) ?? lockedDestination?.currencyCode ?? "";
          return (
            <form.Field name="sourceAmount">
              {(field) => (
                <Field className="items-stretch" name={field.name}>
                  <FieldLabel className="sr-only" htmlFor={field.name}>
                    Amount
                  </FieldLabel>
                  <AmountInput
                    // oxlint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={!editing}
                    currencySymbol={
                      currency ? moneyParts(0, currency).currency : ""
                    }
                    id={field.name}
                    invalid={field.state.meta.errors.length > 0}
                    onBlur={field.handleBlur}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                  {suggestions.length > 0 && currency ? (
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {suggestions.map((suggestion) => (
                        <button
                          className="bg-secondary hover:bg-accent focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors outline-none focus-visible:ring-3"
                          key={suggestion.label}
                          onClick={() =>
                            field.handleChange(trimDecimal(suggestion.amount))
                          }
                          type="button"
                        >
                          <span className="text-muted-foreground">
                            {suggestion.label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatMoney(suggestion.amount, currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex justify-center">
                    {field.state.meta.errors.map((error) => (
                      <FieldError key={error?.message} match>
                        {error?.message}
                      </FieldError>
                    ))}
                  </div>
                </Field>
              )}
            </form.Field>
          );
        }}
      </form.Subscribe>

      <div className="bg-card dark:ring-hairline relative flex flex-col rounded-2xl p-4 dark:ring-1">
        <form.Field name="sourceAccountId">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>From</FieldLabel>
              <div className="w-full">
                <AccountPicker
                  accounts={sourceChoices}
                  aria-invalid={field.state.meta.errors.length > 0}
                  ariaLabel="From account"
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </div>
              {field.state.meta.errors.map((error) => (
                <FieldError key={error?.message} match>
                  {error?.message}
                </FieldError>
              ))}
            </Field>
          )}
        </form.Field>

        <div className="flex justify-center py-1">
          {lockDestination ? (
            <span aria-hidden="true" className="text-faint py-1 [&_svg]:size-4">
              <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} />
            </span>
          ) : (
            <Button
              aria-label="Swap accounts"
              onClick={() => {
                const { destinationAccountId: to, sourceAccountId: from } =
                  form.state.values;
                form.setFieldValue("sourceAccountId", to);
                form.setFieldValue("destinationAccountId", from);
              }}
              size="icon-sm"
              variant="secondary"
            >
              <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} />
            </Button>
          )}
        </div>

        <form.Subscribe selector={(state) => state.values.sourceAccountId}>
          {(source) => (
            <form.Field name="destinationAccountId">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>To</FieldLabel>
                  {lockedDestination ? (
                    <div className="flex h-10 items-center gap-2.5 sm:h-9">
                      <IconTile tint={accountTint(lockedDestination)} size="xs">
                        <HugeiconsIcon
                          icon={accountKind(lockedDestination.accountType).icon}
                          strokeWidth={2}
                        />
                      </IconTile>
                      <span className="text-sm font-medium">
                        {lockedDestination.name}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full">
                      <AccountPicker
                        accounts={activeAccounts.filter(
                          (account) => account.id !== source
                        )}
                        aria-invalid={field.state.meta.errors.length > 0}
                        ariaLabel="To account"
                        onValueChange={field.handleChange}
                        value={field.state.value}
                      />
                    </div>
                  )}
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

      <form.Subscribe
        selector={(state) => ({
          destination: state.values.destinationAccountId,
          source: state.values.sourceAccountId,
        })}
      >
        {({ destination, source }) => {
          const from = currencyOf(source);
          const to = currencyOf(destination);
          if (!(from && to) || from === to) {
            return null;
          }
          return (
            <form.Field name="destinationAmount">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>
                    Amount received in {to}
                  </FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    numeric
                    id={field.name}
                    inputMode="decimal"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="0.00"
                    value={field.state.value}
                  />
                  <p className="text-muted-foreground text-xs">
                    The accounts use different currencies, so record what
                    arrived.
                  </p>
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>
          );
        }}
      </form.Subscribe>

      <form.Field name="transactionDate">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Date</FieldLabel>
            <div className="w-full">
              <DatePicker
                id={field.name}
                onValueChange={field.handleChange}
                value={field.state.value}
              />
            </div>
          </Field>
        )}
      </form.Field>

      <form.Field name="notes">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Note</FieldLabel>
            <Textarea
              id={field.name}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Optional"
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
        {(state) => <FormActions>{actions(state)}</FormActions>}
      </form.Subscribe>
    </form>
  );
};
