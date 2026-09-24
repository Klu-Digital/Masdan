import { RECURRING_FREQUENCIES } from "@masdan/api/recurring/recurrence";
import { positiveAmount } from "@masdan/api/transactions/amounts";
import { TRANSACTION_PAID_STATUSES } from "@masdan/api/transactions/constants";
import { AmountInput } from "@masdan/ui/components/amount-input";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Switch } from "@masdan/ui/components/switch";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { moneyParts } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { formatLongDate } from "@/lib/dates";
import { householdToday } from "@/lib/household-date";
import { AccountPicker } from "@/modules/accounts/components/account-picker";
import type { PickerAccount } from "@/modules/accounts/components/account-picker";
import { CategoryPicker } from "@/modules/categories/components/category-picker";
import {
  FormActions,
  trimDecimal,
} from "@/modules/transactions/components/transaction-form";
import { client } from "@/utils/orpc";

import {
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  previewOccurrences,
} from "../presentation";
import { invalidateSchedules } from "../queries";
import type { Schedule, ScheduleInput } from "../queries";

export interface ComposerAccount extends PickerAccount {
  archivedAt: Date | null;
}

export interface ComposerCategory {
  archivedAt: Date | null;
  color: string;
  icon: string;
  id: string;
  name: string;
  type: string;
}

export interface ComposerTag {
  archivedAt: Date | null;
  color: string;
  id: string;
  name: string;
}

const MAX_INTERVAL = 366;

const scheduleFormSchema = z.object({
  accountId: z.string().uuid("Choose an account"),
  amount: positiveAmount,
  categoryId: z.string().uuid("Choose a category"),
  frequency: z.enum(RECURRING_FREQUENCIES),
  interval: z
    .string()
    .trim()
    .regex(/^\d+$/u, "Use a whole number")
    .refine(
      (value) => Number(value) >= 1 && Number(value) <= MAX_INTERVAL,
      `Use 1 to ${MAX_INTERVAL}`
    ),
  kind: z.enum(["expense", "income"]),
  name: z.string().trim().min(1, "Give the schedule a name").max(80),
  notes: z.string().max(2000),
  paidStatus: z.enum(TRANSACTION_PAID_STATUSES),
  startDate: z.string().min(1, "Choose a start date"),
  tagIds: z.array(z.string()),
});

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
type Kind = ScheduleFormValues["kind"];

const toFormValues = (
  today: string,
  defaultAccountId: string,
  schedule?: Schedule
): ScheduleFormValues =>
  schedule
    ? {
        accountId: schedule.accountId,
        amount: trimDecimal(schedule.amount),
        categoryId: schedule.categoryId,
        frequency: schedule.frequency,
        interval: String(schedule.interval),
        kind: schedule.type === "income" ? "income" : "expense",
        name: schedule.name,
        notes: schedule.notes ?? "",
        paidStatus: schedule.paidStatus,
        startDate: schedule.startDate,
        tagIds: schedule.tags.map(({ id }) => id),
      }
    : {
        accountId: defaultAccountId,
        amount: "",
        categoryId: "",
        frequency: "monthly",
        interval: "1",
        kind: "expense",
        name: "",
        notes: "",
        paidStatus: "paid",
        startDate: today,
        tagIds: [],
      };

const toInput = (values: ScheduleFormValues): ScheduleInput => ({
  accountId: values.accountId,
  amount: values.amount.trim(),
  categoryId: values.categoryId,
  frequency: values.frequency,
  interval: Number(values.interval),
  name: values.name.trim(),
  notes: values.notes.trim() || null,
  paidStatus: values.paidStatus,
  startDate: values.startDate,
  tagIds: values.tagIds,
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

const isFrequency = (
  value: unknown
): value is (typeof RECURRING_FREQUENCIES)[number] =>
  RECURRING_FREQUENCIES.some((frequency) => frequency === value);

/** Where the schedule will post next, as the server will compute it. */
const TimingPreview = ({
  schedule,
  today,
  values,
}: {
  schedule?: Schedule;
  today: string;
  values: Pick<ScheduleFormValues, "frequency" | "interval" | "startDate">;
}) => {
  const recurrence = {
    frequency: values.frequency,
    interval: Number(values.interval),
    startDate: values.startDate,
  };
  const unchanged =
    schedule !== undefined &&
    schedule.nextOccurrenceDate !== null &&
    schedule.frequency === recurrence.frequency &&
    schedule.interval === recurrence.interval &&
    schedule.startDate === recurrence.startDate;
  const from =
    unchanged && schedule.nextOccurrenceDate
      ? schedule.nextOccurrenceDate
      : today;
  const dates = previewOccurrences(recurrence, from);
  if (!dates) {
    return null;
  }
  return (
    <output className="text-muted-foreground text-xs">
      {`Posts ${dates.map((date) => formatLongDate(date)).join(", ")}, …`}
      {values.startDate < today
        ? " Dates before today are not filled in."
        : null}
    </output>
  );
};

/**
 * Create or edit one recurring schedule: the transaction it posts, then when.
 * Edits change future occurrences only; posted transactions stay as they are.
 */
// One form with a field per template and timing setting.
// oxlint-disable-next-line complexity
export const ScheduleComposer = ({
  accounts,
  activeOrganizationId,
  categories,
  householdCurrency,
  onOpenChange,
  open,
  schedule,
  tags,
  timezone,
}: {
  accounts: ComposerAccount[];
  activeOrganizationId: string;
  categories: ComposerCategory[];
  householdCurrency: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  schedule?: Schedule;
  tags: ComposerTag[];
  timezone: string;
}) => {
  const queryClient = useQueryClient();
  const editing = schedule !== undefined;
  const today = householdToday(timezone);
  const activeAccounts = accounts.filter(
    (account) => account.archivedAt === null
  );
  const defaultAccountId =
    activeAccounts.length === 1 ? (activeAccounts[0]?.id ?? "") : "";

  const form = useForm({
    defaultValues: toFormValues(today, defaultAccountId, schedule),
    onSubmit: async ({ value }) => {
      try {
        const input = toInput(value);
        await (schedule
          ? client.recurring.update({ ...input, scheduleId: schedule.id })
          : client.recurring.create(input));
        await invalidateSchedules(queryClient, activeOrganizationId);
        onOpenChange(false);
        toastManager.add({
          title: editing ? "Schedule updated" : `${input.name} scheduled`,
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} the schedule`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: scheduleFormSchema },
  });

  const tagItems = tags.filter((tag) => tag.archivedAt === null);

  return (
    <ResponsiveSheet
      description={
        editing
          ? "Changes apply to future transactions only. Ones already posted stay as they are."
          : "Posts a normal transaction on each date, from today on."
      }
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit schedule" : "New recurring transaction"}
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
        <form.Field name="kind">
          {(field) => (
            <Tabs
              onValueChange={(value) => {
                const kind: Kind = value === "income" ? "income" : "expense";
                field.handleChange(kind);
                const selected = categories.find(
                  ({ id }) => id === form.state.values.categoryId
                );
                if (selected && selected.type !== kind) {
                  form.setFieldValue("categoryId", "");
                }
              }}
              value={field.state.value}
            >
              <TabsList aria-label="Entry type" className="w-full">
                <TabsTab value="expense">Expense</TabsTab>
                <TabsTab value="income">Income</TabsTab>
              </TabsList>
            </Tabs>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.accountId}>
          {(accountId) => {
            const currency =
              accounts.find((account) => account.id === accountId)
                ?.currencyCode ?? householdCurrency;
            return (
              <form.Field name="amount">
                {(field) => (
                  <Field className="items-stretch" name={field.name}>
                    <FieldLabel className="sr-only" htmlFor={field.name}>
                      Amount
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
                placeholder="e.g. Rent"
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <form.Field name="categoryId">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Category</FieldLabel>
                  <div className="w-full">
                    <CategoryPicker
                      aria-invalid={field.state.meta.errors.length > 0}
                      categories={categories.filter(
                        (item) => item.type === kind && item.archivedAt === null
                      )}
                      onValueChange={field.handleChange}
                      value={field.state.value}
                    />
                  </div>
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          )}
        </form.Subscribe>

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

        <fieldset className="flex flex-col gap-4">
          <legend className="text-muted-foreground mb-3 text-xs font-medium">
            Repeats
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="frequency">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Frequency</FieldLabel>
                  <Select
                    onValueChange={(next) => {
                      if (isFrequency(next)) {
                        field.handleChange(next);
                      }
                    }}
                    value={field.state.value}
                  >
                    <SelectTrigger aria-label="Frequency">
                      <SelectValue>
                        {FREQUENCY_LABELS[field.state.value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {RECURRING_FREQUENCIES.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {FREQUENCY_LABELS[frequency]}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.frequency}>
              {(frequency) => (
                <form.Field name="interval">
                  {(field) => (
                    <Field name={field.name}>
                      <FieldLabel htmlFor={field.name}>Every</FieldLabel>
                      <div className="flex w-full items-center gap-2">
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          inputMode="numeric"
                          numeric
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          value={field.state.value}
                        />
                        <span className="text-muted-foreground text-sm">
                          {field.state.value === "1"
                            ? FREQUENCY_UNITS[frequency][0]
                            : FREQUENCY_UNITS[frequency][1]}
                        </span>
                      </div>
                      <FieldErrors errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
          <form.Field name="startDate">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Starting</FieldLabel>
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
          <form.Subscribe
            selector={(state) => ({
              frequency: state.values.frequency,
              interval: state.values.interval,
              startDate: state.values.startDate,
            })}
          >
            {(values) => (
              <TimingPreview
                schedule={schedule}
                today={today}
                values={values}
              />
            )}
          </form.Subscribe>
        </fieldset>

        <form.Field name="notes">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Note</FieldLabel>
              <Textarea
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Copied to every transaction it posts."
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Field name="paidStatus">
          {(field) => (
            <label
              className="bg-card flex items-center justify-between gap-4 rounded-xl px-4 py-3"
              htmlFor="schedule-paid-status"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">Post as paid</span>
                <span className="text-muted-foreground text-xs">
                  Turn off for bills you settle later.
                </span>
              </span>
              <Switch
                checked={field.state.value === "paid"}
                id="schedule-paid-status"
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
                {editing ? "Save" : "Create schedule"}
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};
