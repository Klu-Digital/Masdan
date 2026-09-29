import {
  RULE_TEXT_OPERATORS,
  RULE_TEXT_OPERATOR_LABELS,
} from "@masdan/api/rules/engine";
import type { RuleTextOperator } from "@masdan/api/rules/engine";
import { positiveAmount, scaledAmount } from "@masdan/api/shared/money";
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
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { CategoryPicker } from "@/modules/categories/components/category-picker";
import { FormActions } from "@/modules/transactions/components/transaction-form";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import type { Rule, RuleInput } from "../types";

interface Option {
  label: string;
  value: string;
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

export interface ComposerAccount {
  archivedAt: Date | null;
  id: string;
  name: string;
}

const ANY = "any";

const TYPE_OPTIONS: Option[] = [
  { label: "Money in or out", value: ANY },
  { label: "Money out", value: "expense" },
  { label: "Money in", value: "income" },
];

const OPERATOR_OPTIONS: Option[] = RULE_TEXT_OPERATORS.map((operator) => ({
  label: RULE_TEXT_OPERATOR_LABELS[operator],
  value: operator,
}));

const optionalAmount = z.union([z.literal(""), positiveAmount]);

const ruleFormSchema = z
  .object({
    accountId: z.string(),
    amountMax: optionalAmount,
    amountMin: optionalAmount,
    categoryId: z.string(),
    enabled: z.boolean(),
    name: z.string().trim().min(1, "Give the rule a name").max(80),
    tagIds: z.array(z.string()),
    text: z.string().trim().max(200),
    textOperator: z.enum(RULE_TEXT_OPERATORS),
    type: z.string(),
  })
  .superRefine((value, context) => {
    const hasCondition =
      value.text !== "" ||
      value.type !== ANY ||
      value.accountId !== ANY ||
      value.amountMin !== "" ||
      value.amountMax !== "";
    if (!hasCondition) {
      context.addIssue({
        code: "custom",
        message: "Add at least one thing to match",
        path: ["text"],
      });
    }
    if (value.categoryId === "" && value.tagIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Choose a category or tags for the rule to set",
        path: ["categoryId"],
      });
    }
    if (
      value.amountMin !== "" &&
      value.amountMax !== "" &&
      scaledAmount(value.amountMin) > scaledAmount(value.amountMax)
    ) {
      context.addIssue({
        code: "custom",
        message: "The minimum must not exceed the maximum",
        path: ["amountMin"],
      });
    }
  });

type RuleFormValues = z.input<typeof ruleFormSchema>;

const EMPTY_FORM: RuleFormValues = {
  accountId: ANY,
  amountMax: "",
  amountMin: "",
  categoryId: "",
  enabled: true,
  name: "",
  tagIds: [],
  text: "",
  textOperator: "contains",
  type: ANY,
};

const toFormValues = (rule?: Rule): RuleFormValues => {
  if (!rule) {
    return EMPTY_FORM;
  }
  const { actions, conditions } = rule;
  return {
    accountId: conditions.accountId ?? ANY,
    amountMax: conditions.amountMax ?? "",
    amountMin: conditions.amountMin ?? "",
    categoryId: actions.categoryId ?? "",
    enabled: rule.enabled,
    name: rule.name,
    tagIds: actions.tagIds,
    text: conditions.text?.value ?? "",
    textOperator: conditions.text?.operator ?? "contains",
    type: conditions.type ?? ANY,
  };
};

const toOperator = (value: string): RuleTextOperator =>
  RULE_TEXT_OPERATORS.find((operator) => operator === value) ?? "contains";

const isRuleType = (value: string): value is "expense" | "income" =>
  value === "expense" || value === "income";

const toInput = (values: RuleFormValues): RuleInput => {
  const text = values.text.trim();
  return {
    actions: {
      categoryId: values.categoryId || null,
      tagIds: values.tagIds,
    },
    conditions: {
      accountId: values.accountId === ANY ? null : values.accountId,
      amountMax: values.amountMax.trim() || null,
      amountMin: values.amountMin.trim() || null,
      text: text ? { operator: values.textOperator, value: text } : null,
      type: isRuleType(values.type) ? values.type : null,
    },
    enabled: values.enabled,
    name: values.name.trim(),
  };
};

const OptionSelect = ({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Option[];
  value: string;
}) => (
  <Select
    onValueChange={(next) => onChange(typeof next === "string" ? next : "")}
    value={value}
  >
    <SelectTrigger aria-label={label}>
      <SelectValue>
        {options.find((option) => option.value === value)?.label ?? label}
      </SelectValue>
    </SelectTrigger>
    <SelectPopup>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectPopup>
  </Select>
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

/** Create or edit one rule: what it matches, then what it sets. */
// One form with a field per condition and action.
// oxlint-disable-next-line complexity
export const RuleComposer = ({
  accounts,
  activeOrganizationId,
  categories,
  onOpenChange,
  open,
  rule,
  tags,
}: {
  accounts: ComposerAccount[];
  activeOrganizationId: string;
  categories: ComposerCategory[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rule?: Rule;
  tags: ComposerTag[];
}) => {
  const queryClient = useQueryClient();
  const editing = rule !== undefined;
  const { rules } = householdOrpc(activeOrganizationId);
  const onSuccess = async (_: unknown, { name }: { name: string }) => {
    await invalidate(queryClient, activeOrganizationId, "rules");
    onOpenChange(false);
    toastManager.add({
      title: editing ? "Rule updated" : `${name} added`,
      type: "success",
    });
  };
  const create = useMutation(rules.create.mutationOptions({ onSuccess }));
  const update = useMutation(rules.update.mutationOptions({ onSuccess }));
  const form = useForm({
    defaultValues: toFormValues(rule),
    onSubmit: async ({ value }) => {
      const input = toInput(value);
      // The mutation cache toasts the failure; the form keeps its values.
      await (
        rule
          ? update.mutateAsync({ ...input, ruleId: rule.id })
          : create.mutateAsync(input)
      ).catch(() => null);
    },
    validators: { onSubmit: ruleFormSchema },
  });

  // Archived choices stay visible only where this rule already uses them.
  const accountOptions: Option[] = [
    { label: "Any account", value: ANY },
    ...accounts
      .filter(
        (account) =>
          account.archivedAt === null ||
          account.id === rule?.conditions.accountId
      )
      .map((account) => ({ label: account.name, value: account.id })),
  ];
  const tagItems = tags.filter(
    (tag) => tag.archivedAt === null || rule?.actions.tagIds.includes(tag.id)
  );

  return (
    <ResponsiveSheet
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit rule" : "New rule"}
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
                placeholder="e.g. Grab rides"
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-muted-foreground mb-3 text-xs font-medium">
            When a transaction matches all of these
          </legend>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-muted-foreground text-xs font-medium"
              htmlFor="rule-text"
            >
              Description
            </label>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <form.Field name="textOperator">
                {(field) => (
                  <OptionSelect
                    label="How the description matches"
                    onChange={(value) => field.handleChange(toOperator(value))}
                    options={OPERATOR_OPTIONS}
                    value={field.state.value}
                  />
                )}
              </form.Field>
              <form.Field name="text">
                {(field) => (
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    id="rule-text"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="e.g. grab"
                    value={field.state.value}
                  />
                )}
              </form.Field>
            </div>
            <form.Field name="text">
              {(field) =>
                field.state.meta.errors.map((error) => (
                  <p
                    className="text-destructive-foreground text-xs"
                    key={error?.message}
                  >
                    {error?.message}
                  </p>
                ))
              }
            </form.Field>
            <p className="text-muted-foreground text-xs">
              Checks the note — an imported row’s description. Case doesn’t
              matter.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="type">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Direction</FieldLabel>
                  <OptionSelect
                    label="Direction"
                    onChange={(value) => {
                      field.handleChange(value);
                      const selected = categories.find(
                        ({ id }) => id === form.state.values.categoryId
                      );
                      if (selected && selected.type !== value) {
                        form.setFieldValue("categoryId", "");
                      }
                    }}
                    options={TYPE_OPTIONS}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="accountId">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Account</FieldLabel>
                  <OptionSelect
                    label="Account"
                    onChange={field.handleChange}
                    options={accountOptions}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="amountMin">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Amount from</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    id={field.name}
                    inputMode="decimal"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Any"
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="amountMax">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Amount to</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    id={field.name}
                    inputMode="decimal"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Any"
                    value={field.state.value}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-muted-foreground mb-3 text-xs font-medium">
            Then change only these
          </legend>
          <form.Subscribe selector={(state) => state.values.type}>
            {(type) => (
              <form.Field name="categoryId">
                {(field) => {
                  const items = categories.filter(
                    (item) =>
                      item.type === type &&
                      (item.archivedAt === null ||
                        item.id === rule?.actions.categoryId)
                  );
                  return (
                    <Field name={field.name}>
                      <FieldLabel>Category</FieldLabel>
                      {isRuleType(type) ? (
                        <div className="flex w-full items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <CategoryPicker
                              aria-invalid={field.state.meta.errors.length > 0}
                              categories={items}
                              onValueChange={field.handleChange}
                              value={field.state.value}
                            />
                          </div>
                          {field.state.value ? (
                            <Button
                              onClick={() => field.handleChange("")}
                              size="sm"
                              variant="ghost"
                            >
                              Keep category
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          Choose money in or money out to set a category.
                          Without one, the category is left alone.
                        </p>
                      )}
                      <FieldErrors errors={field.state.meta.errors} />
                    </Field>
                  );
                }}
              </form.Field>
            )}
          </form.Subscribe>

          <form.Field name="tagIds">
            {(field) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Add tags</legend>
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
                                ? field.state.value.filter(
                                    (id) => id !== tag.id
                                  )
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
                <p className="text-muted-foreground text-xs">
                  Tags are added; a transaction’s other tags stay.
                </p>
              </fieldset>
            )}
          </form.Field>
        </fieldset>

        <form.Field name="enabled">
          {(field) => (
            <label
              className="bg-card flex items-center justify-between gap-4 rounded-xl px-4 py-3"
              htmlFor="rule-enabled"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">Enabled</span>
                <span className="text-muted-foreground text-xs">
                  A disabled rule never runs.
                </span>
              </span>
              <Switch
                checked={field.state.value}
                id="rule-enabled"
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </label>
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
                {editing ? "Save" : "Add rule"}
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};
