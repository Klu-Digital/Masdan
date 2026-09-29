import type { CsvDelimiter } from "@masdan/api/imports/csv";
import {
  IMPORT_DATE_FORMATS,
  IMPORT_DATE_FORMAT_LABELS,
  normalizeImportRow,
} from "@masdan/api/imports/mapping";
import type {
  ImportDateFormat,
  ImportMapping,
  OpeningBalanceMode,
} from "@masdan/api/imports/mapping";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldItem, FieldLabel } from "@masdan/ui/components/field";
import { Radio, RadioGroup } from "@masdan/ui/components/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Switch } from "@masdan/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { useForm, useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { z } from "zod";

import { FieldErrors as Errors } from "@/components/field-errors";
import { Amount } from "@/components/finance/amount";
import { AccountPicker } from "@/modules/accounts/components/account-picker";
import type { PickerAccount } from "@/modules/accounts/components/account-picker";

import type { CsvSample } from "../csv-file";

export interface ImportAccount extends PickerAccount {
  archivedAt: Date | null;
  openingBalanceDate: string;
}

export interface ImportCategory {
  archivedAt: Date | null;
  id: string;
  name: string;
  type: string;
}

export interface ImportFormValues {
  accountId: string;
  amountColumn: string;
  amountKind: "signed" | "debitCredit";
  categoryColumn: string;
  creditColumn: string;
  dateColumn: string;
  dateFormat: ImportDateFormat;
  debitColumn: string;
  decimalSeparator: "." | ",";
  defaultExpenseCategoryId: string;
  defaultIncomeCategoryId: string;
  delimiter: CsvDelimiter;
  descriptionColumn: string;
  hasHeaderRow: boolean;
  negativeMeans: "expense" | "income";
  notesColumn: string;
  openingBalanceMode: OpeningBalanceMode;
}

export interface ImportConfig {
  accountId: string;
  defaultExpenseCategoryId: string;
  defaultIncomeCategoryId: string;
  mapping: ImportMapping;
  openingBalanceMode: OpeningBalanceMode;
}

const NONE = "none";
const PREVIEW_ROWS = 8;

const DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  "\t": "Tab",
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "|": "Pipe (|)",
};

const OPENING_BALANCE_CHOICES: {
  description: string;
  label: string;
  value: OpeningBalanceMode;
}[] = [
  {
    description: "Earlier rows are flagged so you can decide later.",
    label: "Skip rows before the opening date",
    value: "reject",
  },
  {
    description:
      "Moves the opening date back and adjusts the opening balance, so today’s balance stays the same.",
    label: "Add them as history, keep today’s balance",
    value: "rebase",
  },
  {
    description:
      "Moves the opening date back; the imported rows add to today’s balance.",
    label: "Add them and update today’s balance",
    value: "include",
  },
];

const columnNumber = (value: string): number | null =>
  value === NONE ? null : Number(value);

export const toImportConfig = (values: ImportFormValues): ImportConfig => ({
  accountId: values.accountId,
  defaultExpenseCategoryId: values.defaultExpenseCategoryId,
  defaultIncomeCategoryId: values.defaultIncomeCategoryId,
  mapping: {
    amount:
      values.amountKind === "signed"
        ? {
            column: Number(values.amountColumn),
            kind: "signed",
            negativeMeans: values.negativeMeans,
          }
        : {
            creditColumn: Number(values.creditColumn),
            debitColumn: Number(values.debitColumn),
            kind: "debitCredit",
          },
    categoryColumn: columnNumber(values.categoryColumn),
    dateColumn: Number(values.dateColumn),
    dateFormat: values.dateFormat,
    decimalSeparator: values.decimalSeparator,
    delimiter: values.delimiter,
    descriptionColumn: Number(values.descriptionColumn),
    hasHeaderRow: values.hasHeaderRow,
    notesColumn: columnNumber(values.notesColumn),
  },
  openingBalanceMode: values.openingBalanceMode,
});

export const toFormValues = (
  config: Omit<ImportConfig, "accountId"> & { accountId: string }
): ImportFormValues => {
  const { amount } = config.mapping;
  const column = (value: number | null) =>
    value === null ? NONE : String(value);
  return {
    accountId: config.accountId,
    amountColumn: amount.kind === "signed" ? String(amount.column) : "0",
    amountKind: amount.kind,
    categoryColumn: column(config.mapping.categoryColumn),
    creditColumn:
      amount.kind === "debitCredit" ? String(amount.creditColumn) : "0",
    dateColumn: String(config.mapping.dateColumn),
    dateFormat: config.mapping.dateFormat,
    debitColumn:
      amount.kind === "debitCredit" ? String(amount.debitColumn) : "0",
    decimalSeparator: config.mapping.decimalSeparator,
    defaultExpenseCategoryId: config.defaultExpenseCategoryId,
    defaultIncomeCategoryId: config.defaultIncomeCategoryId,
    delimiter: config.mapping.delimiter,
    descriptionColumn: String(config.mapping.descriptionColumn),
    hasHeaderRow: config.mapping.hasHeaderRow,
    negativeMeans: amount.kind === "signed" ? amount.negativeMeans : "expense",
    notesColumn: column(config.mapping.notesColumn),
    openingBalanceMode: config.openingBalanceMode,
  };
};

const required = {
  account: z.string().min(1, "Choose the account these rows belong to"),
  expense: z.string().min(1, "Choose a category for money out"),
  income: z.string().min(1, "Choose a category for money in"),
};

interface Option {
  label: string;
  value: string;
}

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
    value={value || null}
  >
    <SelectTrigger aria-label={label}>
      <SelectValue placeholder="Choose">
        {options.find((option) => option.value === value)?.label ?? "Choose"}
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

const PreviewTable = ({
  currency,
  mapping,
  sample,
}: {
  currency: string;
  mapping: ImportMapping;
  sample: CsvSample;
}) => {
  const rows = sample.records
    .slice(0, PREVIEW_ROWS)
    .map((record) => ({ record, row: normalizeImportRow(record, mapping) }));

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No rows found. Check the delimiter and header settings.
      </p>
    );
  }

  return (
    <Table aria-label="How the first rows will be read" variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>Row</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Check</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ record, row }) => (
          <TableRow key={record.rowNumber}>
            <TableCell>
              <span className="text-muted-foreground tabular-nums">
                {record.rowNumber}
              </span>
            </TableCell>
            <TableCell>
              <span className="tabular-nums">{row.transactionDate ?? "—"}</span>
            </TableCell>
            <TableCell>
              <span className="block max-w-64 truncate">
                {row.description ?? "—"}
              </span>
            </TableCell>
            <TableCell className="text-right">
              {row.amount ? (
                <Amount
                  currency={currency}
                  sign={row.type === "income" ? "in" : "out"}
                  tone="auto"
                  value={row.amount}
                />
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              {row.errors.length > 0 ? (
                <span className="text-destructive-foreground text-xs">
                  {row.errors.map(({ message }) => message).join(" · ")}
                </span>
              ) : (
                <Badge variant="success">Looks good</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** The preview runs the worker's own normalizer, so it shows what commits. */
// One form with conditional amount fields; splitting it scatters the state.
// oxlint-disable-next-line complexity
export const MappingForm = ({
  accounts,
  categories,
  initialValues,
  lockSource = false,
  onCancel,
  onSubmit,
  sample,
  submitLabel,
}: {
  accounts: ImportAccount[];
  categories: ImportCategory[];
  initialValues: ImportFormValues;
  lockSource?: boolean;
  onCancel?: () => void;
  onSubmit: (config: ImportConfig) => Promise<void>;
  sample: (delimiter: CsvDelimiter, hasHeaderRow: boolean) => CsvSample;
  submitLabel: string;
}) => {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(toImportConfig(value));
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const current = useMemo(
    () => sample(values.delimiter, values.hasHeaderRow),
    [sample, values.delimiter, values.hasHeaderRow]
  );
  const columns: Option[] = current.headers.map((header, index) => ({
    label: header,
    value: String(index),
  }));
  const optionalColumns: Option[] = [
    { label: "Not in this file", value: NONE },
    ...columns,
  ];
  const activeCategories = categories.filter(
    (category) => category.archivedAt === null
  );
  const categoryOptions = (type: string): Option[] =>
    activeCategories
      .filter((category) => category.type === type)
      .map((category) => ({ label: category.name, value: category.id }));
  const account = accounts.find((item) => item.id === values.accountId);

  return (
    <form
      aria-label="Map columns"
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Destination</h2>
        <form.Field
          name="accountId"
          validators={{ onSubmit: required.account }}
        >
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>Account</FieldLabel>
              <AccountPicker
                accounts={accounts.filter((item) => item.archivedAt === null)}
                aria-invalid={field.state.meta.errors.length > 0}
                onValueChange={field.handleChange}
                value={field.state.value}
              />
              <Errors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </section>

      {lockSource ? null : (
        <section className="grid gap-4 sm:grid-cols-2">
          <form.Field name="delimiter">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Separator</FieldLabel>
                <OptionSelect
                  label="Separator"
                  onChange={(next) => field.handleChange(next as CsvDelimiter)}
                  options={Object.entries(DELIMITER_LABELS).map(
                    ([value, label]) => ({ label, value })
                  )}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="hasHeaderRow">
            {(field) => (
              <label
                className="flex items-center justify-between gap-3 self-end py-2 text-sm"
                htmlFor="has-header-row"
              >
                First row is column names
                <Switch
                  checked={field.state.value}
                  id="has-header-row"
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </label>
            )}
          </form.Field>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Columns</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="dateColumn">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Date column</FieldLabel>
                <OptionSelect
                  label="Date column"
                  onChange={field.handleChange}
                  options={columns}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="dateFormat">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Date format</FieldLabel>
                <OptionSelect
                  label="Date format"
                  onChange={(next) =>
                    field.handleChange(next as ImportDateFormat)
                  }
                  options={IMPORT_DATE_FORMATS.map((format) => ({
                    label: IMPORT_DATE_FORMAT_LABELS[format],
                    value: format,
                  }))}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="descriptionColumn">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Description column</FieldLabel>
                <OptionSelect
                  label="Description column"
                  onChange={field.handleChange}
                  options={columns}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="notesColumn">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Notes column</FieldLabel>
                <OptionSelect
                  label="Notes column"
                  onChange={field.handleChange}
                  options={optionalColumns}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="categoryColumn">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Category column</FieldLabel>
                <OptionSelect
                  label="Category column"
                  onChange={field.handleChange}
                  options={optionalColumns}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Amounts</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="amountKind">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Amounts are in</FieldLabel>
                <OptionSelect
                  label="Amounts are in"
                  onChange={(next) =>
                    field.handleChange(next as ImportFormValues["amountKind"])
                  }
                  options={[
                    { label: "One column, signed", value: "signed" },
                    {
                      label: "Separate debit and credit columns",
                      value: "debitCredit",
                    },
                  ]}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="decimalSeparator">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Decimal separator</FieldLabel>
                <OptionSelect
                  label="Decimal separator"
                  onChange={(next) =>
                    field.handleChange(
                      next as ImportFormValues["decimalSeparator"]
                    )
                  }
                  options={[
                    { label: "Dot (1,234.50)", value: "." },
                    { label: "Comma (1.234,50)", value: "," },
                  ]}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          {values.amountKind === "signed" ? (
            <>
              <form.Field name="amountColumn">
                {(field) => (
                  <Field name={field.name}>
                    <FieldLabel>Amount column</FieldLabel>
                    <OptionSelect
                      label="Amount column"
                      onChange={field.handleChange}
                      options={columns}
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="negativeMeans">
                {(field) => (
                  <Field name={field.name}>
                    <FieldLabel>Negative amounts are</FieldLabel>
                    <OptionSelect
                      label="Negative amounts are"
                      onChange={(next) =>
                        field.handleChange(
                          next as ImportFormValues["negativeMeans"]
                        )
                      }
                      options={[
                        { label: "Money out (spending)", value: "expense" },
                        {
                          label: "Money in (refunds, payments)",
                          value: "income",
                        },
                      ]}
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.Field>
            </>
          ) : (
            <>
              <form.Field name="debitColumn">
                {(field) => (
                  <Field name={field.name}>
                    <FieldLabel>Debit (money out) column</FieldLabel>
                    <OptionSelect
                      label="Debit column"
                      onChange={field.handleChange}
                      options={columns}
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="creditColumn">
                {(field) => (
                  <Field name={field.name}>
                    <FieldLabel>Credit (money in) column</FieldLabel>
                    <OptionSelect
                      label="Credit column"
                      onChange={field.handleChange}
                      options={columns}
                      value={field.state.value}
                    />
                  </Field>
                )}
              </form.Field>
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Categories</h2>
        <p className="text-muted-foreground text-sm">
          Rows without a matching category use these.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field
            name="defaultExpenseCategoryId"
            validators={{ onSubmit: required.expense }}
          >
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Money out</FieldLabel>
                <OptionSelect
                  label="Category for money out"
                  onChange={field.handleChange}
                  options={categoryOptions("expense")}
                  value={field.state.value}
                />
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field
            name="defaultIncomeCategoryId"
            validators={{ onSubmit: required.income }}
          >
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Money in</FieldLabel>
                <OptionSelect
                  label="Category for money in"
                  onChange={field.handleChange}
                  options={categoryOptions("income")}
                  value={field.state.value}
                />
                <Errors errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">
          Rows before the opening date
        </h2>
        <p className="text-muted-foreground text-sm">
          {account
            ? `${account.name} starts on ${account.openingBalanceDate}. Balances only count transactions from that date.`
            : "Balances only count transactions from the account’s opening date."}
        </p>
        <form.Field name="openingBalanceMode">
          {(field) => (
            <Field name={field.name}>
              <RadioGroup
                aria-label="Rows before the opening date"
                onValueChange={(next) =>
                  field.handleChange(next as OpeningBalanceMode)
                }
                value={field.state.value}
              >
                {OPENING_BALANCE_CHOICES.map((choice) => (
                  <FieldItem key={choice.value}>
                    <FieldLabel>
                      <Radio value={choice.value} />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-foreground text-sm">
                          {choice.label}
                        </span>
                        <span className="font-normal">
                          {choice.description}
                        </span>
                      </span>
                    </FieldLabel>
                  </FieldItem>
                ))}
              </RadioGroup>
            </Field>
          )}
        </form.Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Preview</h2>
        <PreviewTable
          currency={account?.currencyCode ?? "PHP"}
          mapping={toImportConfig(values).mapping}
          sample={current}
        />
        {current.truncated ? (
          <p className="text-muted-foreground text-xs">
            Showing the first rows. Every row is checked after you continue.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button onClick={onCancel} type="button" variant="ghost">
            Cancel
          </Button>
        ) : null}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button loading={isSubmitting} type="submit">
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
};
