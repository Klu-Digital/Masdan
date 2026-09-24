import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TRANSACTION_PAID_STATUSES } from "@masdan/api/transactions/constants";
import { AmountInput } from "@masdan/ui/components/amount-input";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Switch } from "@masdan/ui/components/switch";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { formatMoney, moneyParts } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { MoreOptions } from "@/components/more-options";
import { householdToday } from "@/lib/household-date";
import { AccountPicker } from "@/modules/accounts/components/account-picker";
import {
  accountsQueryOptions,
  invalidateAccounts,
} from "@/modules/accounts/queries";
import { CategoryPicker } from "@/modules/categories/components/category-picker";
import { categoriesQueryOptions } from "@/modules/categories/queries";
import { tagsQueryOptions } from "@/modules/tags/queries";
import { client } from "@/utils/orpc";

import { invalidateTransactions, transactionQueryOptions } from "../queries";
import type { TransactionDetail } from "../queries";
import { TransactionAttachments } from "./transaction-attachments";

const positiveAmountPattern = /^(?<whole>\d+)(?<fraction>\.\d{1,6})?$/u;
const SCALE_FACTOR = 1_000_000n;

const positiveAmount = z
  .string()
  .trim()
  .regex(positiveAmountPattern, "Enter an amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

const splitSchema = z.object({
  amount: positiveAmount,
  categoryId: z.string().uuid("Choose a category"),
});

/** Exact decimal arithmetic: split totals must match to the sixth place. */
const scaledAmount = (value: string): bigint | null => {
  if (!positiveAmountPattern.test(value) || !/[1-9]/u.test(value)) {
    return null;
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(6, "0"));
};

const splitTotal = (splits: { amount: string }[]): bigint | null => {
  let total = 0n;
  for (const split of splits) {
    const amount = scaledAmount(split.amount);
    if (amount === null) {
      return null;
    }
    total += amount;
  }
  return total;
};

const scaledToNumber = (value: bigint): number =>
  Number(value) / Number(SCALE_FACTOR);

/** "300.750000" → "300.75" for editing; the API always sends six places. */
export const trimDecimal = (value: string | undefined): string => {
  if (!value) {
    return "";
  }
  return value.includes(".")
    ? value.replace(/0+$/u, "").replace(/\.$/u, "")
    : value;
};

const transactionSchema = z
  .object({
    accountId: z.string().uuid("Choose an account"),
    amount: positiveAmount,
    categoryId: z.string().uuid("Choose a category"),
    notes: z.string().max(2000),
    paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
    splits: z.array(splitSchema).max(50),
    tagIds: z.array(z.string().uuid()),
    transactionDate: z.string().min(1, "Choose a date"),
  })
  .superRefine((value, context) => {
    if (value.splits.length === 0) {
      return;
    }
    const amount = scaledAmount(value.amount);
    const total = splitTotal(value.splits);
    if (amount === null || total !== amount) {
      context.addIssue({
        code: "custom",
        message: "Split lines must add up to the amount",
        path: ["splits"],
      });
    }
  });

type TransactionFormValues = z.infer<typeof transactionSchema>;

export type TransactionKindChoice = "expense" | "income";

export interface FormActionState {
  canSubmit: boolean;
  isSubmitting: boolean;
}

/** Keeps the primary action in reach at the bottom of a scrolling sheet. */
export const FormActions = ({ children }: { children: ReactNode }) => (
  <div className="bg-popover sticky bottom-0 z-10 -mx-6 mt-1 flex items-center justify-end gap-2 px-6 pt-3 pb-1 max-sm:-mx-5 max-sm:px-5 max-sm:*:flex-1">
    {children}
  </div>
);

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

const SplitSummary = ({
  amount,
  currency,
  splits,
}: {
  amount: string;
  currency: string;
  splits: { amount: string }[];
}) => {
  const target = scaledAmount(amount);
  const total = splitTotal(splits.filter((split) => split.amount !== ""));
  if (target === null || total === null) {
    return (
      <p className="text-muted-foreground text-xs">
        Enter the total and each line’s amount.
      </p>
    );
  }
  const remaining = target - total;
  let label = "Fully allocated";
  let tone: "positive" | "warning" | "danger" = "positive";
  if (remaining > 0n) {
    label = `${formatMoney(scaledToNumber(remaining), currency)} left to allocate`;
    tone = "warning";
  } else if (remaining < 0n) {
    label = `${formatMoney(scaledToNumber(-remaining), currency)} over the total`;
    tone = "danger";
  }
  const allocated = Math.min(scaledToNumber(total), scaledToNumber(target));
  return (
    <Meter
      aria-label="Split allocation"
      max={scaledToNumber(target)}
      value={allocated}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={
            tone === "danger"
              ? "text-destructive-foreground text-xs font-medium"
              : "text-muted-foreground text-xs"
          }
        >
          {label}
        </span>
      </div>
      <MeterTrack>
        <MeterIndicator tone={tone} />
      </MeterTrack>
    </Meter>
  );
};

// One form serves create and edit so validation cannot drift between them.
// oxlint-disable-next-line complexity
export const TransactionForm = ({
  actions,
  activeOrganizationId,
  defaultAccountId,
  householdCurrency,
  kind,
  onSaved,
  timezone,
  transaction,
}: {
  /** The footer, rendered inside the form so its submit button needs no wiring. */
  actions: (state: FormActionState) => ReactNode;
  activeOrganizationId: string;
  defaultAccountId?: string;
  householdCurrency: string;
  kind: TransactionKindChoice;
  onSaved: (transactionId: string) => void;
  timezone: string;
  transaction?: TransactionDetail;
}) => {
  const queryClient = useQueryClient();
  const editing = transaction !== undefined;
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const categories = useQuery(categoriesQueryOptions(activeOrganizationId));
  const tags = useQuery(tagsQueryOptions(activeOrganizationId));

  const activeAccounts =
    accounts.data?.filter((account) => account.archivedAt === null) ?? [];
  const firstAccount =
    defaultAccountId ??
    (activeAccounts.length === 1 ? activeAccounts[0]?.id : undefined);

  const defaultValues: TransactionFormValues = {
    accountId: transaction?.accountId ?? firstAccount ?? "",
    amount: trimDecimal(transaction?.amount),
    categoryId: transaction?.categoryId ?? "",
    notes: transaction?.notes ?? "",
    paidStatus: transaction?.paidStatus ?? "paid",
    splits:
      transaction?.splits.map(({ amount, categoryId }) => ({
        amount: trimDecimal(amount),
        categoryId,
      })) ?? [],
    tagIds: transaction?.tags.map(({ id }) => id) ?? [],
    transactionDate: transaction?.transactionDate ?? householdToday(timezone),
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      const payload =
        value.splits.length > 0
          ? {
              ...value,
              categoryId: value.splits[0]?.categoryId ?? value.categoryId,
            }
          : value;
      try {
        const saved = await (transaction
          ? client.transactions.update({
              ...payload,
              transactionId: transaction.id,
            })
          : client.transactions.create(payload));
        await Promise.all([
          invalidateTransactions(queryClient, activeOrganizationId),
          invalidateAccounts(queryClient, activeOrganizationId),
          queryClient.invalidateQueries({ queryKey: ["account"] }),
          queryClient.invalidateQueries({
            queryKey: transactionQueryOptions(saved.id).queryKey,
          }),
        ]);
        formApi.reset();
        toastManager.add({
          title: editing
            ? "Changes saved"
            : `${kind === "income" ? "Income" : "Expense"} added`,
          type: "success",
        });
        onSaved(saved.id);
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "save" : "add"} this transaction`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: transactionSchema },
  });

  // Switching between expense and income invalidates a category of the other type.
  useEffect(() => {
    const current = categories.data?.find(
      (category) => category.id === form.getFieldValue("categoryId")
    );
    if (current && current.type !== kind) {
      form.setFieldValue("categoryId", "");
      form.setFieldValue("splits", []);
    }
  }, [categories.data, form, kind]);

  if (accounts.isPending || categories.isPending || tags.isPending) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <Skeleton className="mx-auto h-14 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (accounts.isError || categories.isError || tags.isError) {
    return (
      <p className="text-muted-foreground py-6 text-center">
        Couldn’t load your accounts and categories. Close this and try again.
      </p>
    );
  }

  const categoryItems = categories.data.filter(
    (category) =>
      category.type === kind &&
      (category.archivedAt === null ||
        category.id === transaction?.categoryId ||
        transaction?.splits.some((split) => split.categoryId === category.id))
  );
  const tagItems = tags.data.filter(
    (tag) =>
      tag.archivedAt === null ||
      transaction?.tags.some(({ id }) => id === tag.id)
  );
  const opensAdvanced =
    editing &&
    (transaction.tags.length > 0 ||
      transaction.splits.length > 0 ||
      transaction.paidStatus === "unpaid");

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
      <form.Subscribe selector={(state) => state.values.accountId}>
        {(accountId) => {
          const currency =
            activeAccounts.find((account) => account.id === accountId)
              ?.currencyCode ??
            transaction?.currencyCode ??
            householdCurrency;
          return (
            <form.Field name="amount">
              {(field) => (
                <Field className="items-stretch" name={field.name}>
                  <FieldLabel className="sr-only" htmlFor={field.name}>
                    Amount
                  </FieldLabel>
                  <AmountInput
                    // Opening the composer is a request to type a number.
                    // oxlint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={!editing}
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

      <form.Subscribe selector={(state) => state.values.splits.length > 0}>
        {(splitMode) =>
          splitMode ? null : (
            <form.Field name="categoryId">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Category</FieldLabel>
                  <div className="w-full">
                    <CategoryPicker
                      aria-invalid={field.state.meta.errors.length > 0}
                      categories={categoryItems}
                      onValueChange={field.handleChange}
                      value={field.state.value}
                    />
                  </div>
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          )
        }
      </form.Subscribe>

      <div className="grid gap-5 sm:grid-cols-2">
        <form.Field name="accountId">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>Account</FieldLabel>
              <div className="w-full">
                <AccountPicker
                  accounts={activeAccounts}
                  aria-invalid={field.state.meta.errors.length > 0}
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </div>
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="transactionDate">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Date</FieldLabel>
              <div className="w-full">
                <DatePicker
                  aria-invalid={field.state.meta.errors.length > 0}
                  id={field.name}
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </div>
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field name="notes">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Note</FieldLabel>
            <Textarea
              id={field.name}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="What was it for? The first line becomes its title."
              value={field.state.value}
            />
            <FieldErrors errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>

      {transaction ? (
        <TransactionAttachments editable transactionId={transaction.id} />
      ) : null}

      <MoreOptions defaultOpen={opensAdvanced}>
        <form.Field name="paidStatus">
          {(field) => (
            <label
              className="bg-card flex items-center justify-between gap-4 rounded-xl px-4 py-3"
              htmlFor="paid-status"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">Paid</span>
                <span className="text-muted-foreground text-xs">
                  Turn off for a bill you haven’t settled yet.
                </span>
              </span>
              <Switch
                checked={field.state.value === "paid"}
                id="paid-status"
                onCheckedChange={(checked) =>
                  field.handleChange(checked ? "paid" : "unpaid")
                }
              />
            </label>
          )}
        </form.Field>

        <form.Field name="tagIds">
          {(field) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-muted-foreground mb-2 text-xs font-medium">
                Tags
              </legend>
              {tagItems.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No tags yet — create them under Organize → Tags.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tagItems.map((tag) => {
                    const selected = field.state.value.includes(tag.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className="bg-secondary hover:bg-accent aria-pressed:bg-brand-soft aria-pressed:text-brand-text focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
                        key={tag.id}
                        onClick={() =>
                          field.handleChange(
                            selected
                              ? field.state.value.filter((id) => id !== tag.id)
                              : [...field.state.value, tag.id]
                          )
                        }
                        type="button"
                      >
                        <ColorDot tint={tag.color} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          )}
        </form.Field>

        <form.Field mode="array" name="splits">
          {(field) => {
            const splitMode = field.state.value.length > 0;
            const currency =
              activeAccounts.find(
                (account) => account.id === form.state.values.accountId
              )?.currencyCode ?? householdCurrency;
            return (
              <fieldset className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <legend className="text-muted-foreground text-xs font-medium">
                    Split across categories
                  </legend>
                  <Button
                    onClick={() => {
                      if (splitMode) {
                        form.setFieldValue(
                          "categoryId",
                          field.state.value[0]?.categoryId ?? ""
                        );
                        field.handleChange([]);
                        return;
                      }
                      field.handleChange([
                        {
                          amount: form.state.values.amount,
                          categoryId: form.state.values.categoryId,
                        },
                        { amount: "", categoryId: "" },
                      ]);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    {splitMode ? "Use one category" : "Split"}
                  </Button>
                </div>
                {splitMode ? (
                  <div className="flex flex-col gap-2">
                    {field.state.value.map((split, index) => (
                      <div
                        className="flex items-center gap-2"
                        // Split lines have no identity until saved.
                        // oxlint-disable-next-line react/no-array-index-key
                        key={index}
                      >
                        <div className="min-w-0 flex-1">
                          <CategoryPicker
                            ariaLabel={`Line ${index + 1} category`}
                            categories={categoryItems}
                            onValueChange={(categoryId) => {
                              field.replaceValue(index, {
                                ...split,
                                categoryId,
                              });
                              if (index === 0) {
                                form.setFieldValue("categoryId", categoryId);
                              }
                            }}
                            value={split.categoryId}
                          />
                        </div>
                        <div className="w-32">
                          <Input
                            aria-label={`Line ${index + 1} amount`}
                            numeric
                            inputMode="decimal"
                            onChange={(event) =>
                              field.replaceValue(index, {
                                ...split,
                                amount: event.target.value,
                              })
                            }
                            placeholder="0.00"
                            value={split.amount}
                          />
                        </div>
                        <Button
                          aria-label={`Remove line ${index + 1}`}
                          disabled={field.state.value.length <= 2}
                          onClick={() => field.removeValue(index)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                      <Button
                        onClick={() =>
                          field.pushValue({ amount: "", categoryId: "" })
                        }
                        size="sm"
                        variant="ghost"
                      >
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                        Add line
                      </Button>
                    </div>
                    <form.Subscribe selector={(state) => state.values.amount}>
                      {(amount) => (
                        <SplitSummary
                          amount={amount}
                          currency={currency}
                          splits={field.state.value}
                        />
                      )}
                    </form.Subscribe>
                  </div>
                ) : null}
                {field.state.meta.errors.map((error) => (
                  <p
                    className="text-destructive-foreground text-xs"
                    key={error?.message}
                    role="alert"
                  >
                    {error?.message}
                  </p>
                ))}
              </fieldset>
            );
          }}
        </form.Field>
      </MoreOptions>

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
