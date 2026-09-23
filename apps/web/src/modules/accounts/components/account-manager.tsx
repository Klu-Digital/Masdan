import {
  ACCOUNT_CLASSES,
  ACCOUNT_TYPES,
  ASSET_ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  LIQUIDITY_TYPES,
} from "@masdan/api/accounts/constants";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import { Checkbox } from "@masdan/ui/components/checkbox";
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
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { Radio, RadioGroup } from "@masdan/ui/components/radio-group";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { DatePicker } from "@/components/date-picker";
import { householdToday } from "@/lib/household-date";
import { currenciesQueryOptions } from "@/modules/currency/queries";
import { householdProfileQueryOptions } from "@/modules/household/queries";
import { client } from "@/utils/orpc";

import { invalidateAccounts, accountsQueryOptions } from "../queries";

export type FinancialAccount = Awaited<
  ReturnType<typeof client.accounts.list>
>[number];

interface AccountMember {
  id: string;
  role: string;
  user: { email: string; name: string };
}

type Currency = Awaited<ReturnType<typeof client.currencies.list>>[number];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  auto_loan: "Auto loan",
  bank: "Bank",
  cash: "Cash",
  credit_card: "Credit card",
  e_wallet: "E-wallet",
  investment: "Investment",
  mortgage: "Mortgage",
  other_asset: "Other asset",
  other_liability: "Other liability",
  payable: "Payable",
  personal_loan: "Personal loan",
  property: "Property",
  receivable: "Receivable",
  vehicle: "Vehicle",
};

const ACCOUNT_CLASS_OPTIONS = [
  { label: "Asset", value: "asset" },
  { label: "Liability", value: "liability" },
] as const;

const LIQUIDITY_OPTIONS = [
  { label: "Liquid", value: "liquid" },
  { label: "Semi-liquid", value: "semi_liquid" },
  { label: "Illiquid", value: "illiquid" },
] as const;

interface PickerItem {
  label: string;
  value: string;
}

const findPickerItem = (items: PickerItem[], value: string) =>
  items.find((item) => item.value === value) ?? null;

const AccountCombobox = ({
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
    value={findPickerItem(items, value)}
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

const nonNegativeDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;

const accountSchema = z
  .object({
    accountClass: z.enum(ACCOUNT_CLASSES),
    accountType: z.enum(ACCOUNT_TYPES),
    cardLastFour: z
      .string()
      .trim()
      .regex(/^\d{4}$/u, "Use the last four digits")
      .nullable(),
    cardNetwork: z.string().trim().max(40).nullable(),
    creditLimit: z
      .string()
      .trim()
      .regex(nonNegativeDecimalPattern, "Use a non-negative amount")
      .nullable(),
    currencyCode: z.string().length(3),
    includeInNetWorth: z.boolean(),
    institution: z.string().max(120),
    liquidity: z.enum(LIQUIDITY_TYPES).nullable(),
    name: z.string().trim().min(1, "Name is required").max(120),
    notes: z.string().max(2000),
    openingBalance: z
      .string()
      .trim()
      .regex(/^-?\d+(?<fraction>\.\d{1,6})?$/u, "Use a valid amount"),
    openingBalanceDate: z.string().min(1, "Date is required"),
    ownerMemberIds: z.array(z.string()),
    paymentDueDay: z.number().int().min(1).max(31).nullable(),
    statementClosingDay: z.number().int().min(1).max(31).nullable(),
  })
  .refine(
    (value) =>
      value.accountClass === "asset"
        ? ASSET_ACCOUNT_TYPES.includes(
            value.accountType as (typeof ASSET_ACCOUNT_TYPES)[number]
          )
        : LIABILITY_ACCOUNT_TYPES.includes(
            value.accountType as (typeof LIABILITY_ACCOUNT_TYPES)[number]
          ),
    { message: "Choose a matching account type", path: ["accountType"] }
  )
  .refine(
    (value) => value.accountClass === "asset" || value.liquidity === null,
    {
      message: "Liability accounts cannot have liquidity",
      path: ["liquidity"],
    }
  )
  .refine(
    (value) =>
      value.accountType === "credit_card" ||
      (value.cardLastFour === null &&
        value.cardNetwork === null &&
        value.creditLimit === null &&
        value.paymentDueDay === null &&
        value.statementClosingDay === null),
    {
      message: "Card metadata requires a credit-card account",
      path: ["accountType"],
    }
  );

type AccountFormValues = z.infer<typeof accountSchema>;

const accountTypeOptions = (accountClass: string) =>
  (accountClass === "asset"
    ? ASSET_ACCOUNT_TYPES
    : LIABILITY_ACCOUNT_TYPES
  ).map((value) => ({ label: ACCOUNT_TYPE_LABELS[value], value }));

const formatBalance = (balance: string, currencyCode: string) => {
  try {
    return new Intl.NumberFormat(undefined, {
      currency: currencyCode,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      style: "currency",
    }).format(Number(balance));
  } catch {
    return `${balance} ${currencyCode}`;
  }
};

// The create and edit forms share one contract to prevent validation drift.
// oxlint-disable-next-line complexity
export const AccountFormDialog = ({
  account,
  activeOrganizationId,
  canCreate,
  canUpdate,
  defaultCurrency,
  members,
  currencies,
}: {
  account?: Awaited<ReturnType<typeof client.accounts.get>>;
  activeOrganizationId: string;
  canCreate: boolean;
  canUpdate: boolean;
  defaultCurrency: string;
  members: AccountMember[];
  currencies: Currency[];
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const editing = account !== undefined;
  const defaultValues: AccountFormValues = {
    accountClass: account?.accountClass === "liability" ? "liability" : "asset",
    accountType:
      (account?.accountType as AccountFormValues["accountType"]) ?? "bank",
    cardLastFour: account?.cardLastFour ?? null,
    cardNetwork: account?.cardNetwork ?? null,
    creditLimit: account?.creditLimit ?? null,
    currencyCode: account?.currencyCode ?? defaultCurrency,
    includeInNetWorth: account?.includeInNetWorth ?? true,
    institution: account?.institution ?? "",
    liquidity:
      account?.accountClass === "liability"
        ? null
        : ((account?.liquidity as AccountFormValues["liquidity"]) ?? "liquid"),
    name: account?.name ?? "",
    notes: account?.notes ?? "",
    openingBalance: account?.openingBalance ?? "0",
    openingBalanceDate:
      account?.openingBalanceDate ??
      householdToday(
        queryClient.getQueryData(
          householdProfileQueryOptions(activeOrganizationId).queryKey
        )?.timezone ?? "Asia/Manila"
      ),
    ownerMemberIds: account?.ownerMemberIds ?? [],
    paymentDueDay: account?.paymentDueDay ?? null,
    statementClosingDay: account?.statementClosingDay ?? null,
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      try {
        await (account
          ? client.accounts.update({ ...value, accountId: account.id })
          : client.accounts.create(value));
        await invalidateAccounts(queryClient, activeOrganizationId);
        if (account) {
          await queryClient.invalidateQueries({
            queryKey: ["account", account.id],
          });
        }
        formApi.reset();
        setOpen(false);
        toastManager.add({
          title: editing ? "Account updated" : "Account created",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : `Could not ${editing ? "update" : "create"} account`,
          type: "error",
        });
      }
    },
    validators: { onSubmit: accountSchema },
  });

  if (editing && !canUpdate) {
    return null;
  }
  if (!editing && !canCreate) {
    return null;
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          account ? (
            <Button size="sm" variant="outline">
              Edit
            </Button>
          ) : (
            <Button>Add account</Button>
          )
        }
      />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit account" : "Add financial account"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto px-6 pb-2"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="accountClass">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Class</FieldLabel>
                  <div className="pt-2">
                    <RadioGroup
                      aria-label="Account class"
                      className="flex-row"
                      name={field.name}
                      onValueChange={(value: string) => {
                        const nextClass =
                          value as AccountFormValues["accountClass"];
                        field.handleChange(nextClass);
                        form.setFieldValue(
                          "liquidity",
                          nextClass === "asset" ? "liquid" : null
                        );
                      }}
                      value={field.state.value}
                    >
                      {ACCOUNT_CLASS_OPTIONS.map((option) => (
                        <label
                          className="flex items-center gap-2 text-sm"
                          key={option.value}
                        >
                          <Radio value={option.value} />
                          {option.label}
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                </Field>
              )}
            </form.Field>
            <form.Field name="accountType">
              {(field) => (
                <form.Subscribe selector={(state) => state.values.accountClass}>
                  {(accountClass) => (
                    <Field name={field.name}>
                      <FieldLabel>Type</FieldLabel>
                      <AccountCombobox
                        ariaLabel="Account type"
                        items={accountTypeOptions(accountClass)}
                        onValueChange={(value) => {
                          const nextType =
                            value as AccountFormValues["accountType"];
                          field.handleChange(nextType);
                          if (nextType !== "credit_card") {
                            form.setFieldValue("cardLastFour", null);
                            form.setFieldValue("cardNetwork", null);
                            form.setFieldValue("creditLimit", null);
                            form.setFieldValue("paymentDueDay", null);
                            form.setFieldValue("statementClosingDay", null);
                          }
                        }}
                        value={field.state.value}
                      />
                      {field.state.meta.errors.map((error) => (
                        <FieldError key={error?.message} match>
                          {error?.message}
                        </FieldError>
                      ))}
                    </Field>
                  )}
                </form.Subscribe>
              )}
            </form.Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="currencyCode">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Currency</FieldLabel>
                  <AccountCombobox
                    ariaLabel="Currency"
                    items={currencies.map((currency) => ({
                      label: `${currency.code} — ${currency.name}`,
                      value: currency.code,
                    }))}
                    onValueChange={(value) => field.handleChange(value)}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.accountClass}>
              {(accountClass) =>
                accountClass === "asset" ? (
                  <form.Field name="liquidity">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel>Liquidity</FieldLabel>
                        <AccountCombobox
                          ariaLabel="Liquidity"
                          items={LIQUIDITY_OPTIONS.map((option) => ({
                            label: option.label,
                            value: option.value,
                          }))}
                          onValueChange={(value) =>
                            field.handleChange(
                              value as AccountFormValues["liquidity"]
                            )
                          }
                          value={field.state.value ?? ""}
                        />
                      </Field>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
          </div>

          <form.Subscribe selector={(state) => state.values.accountType}>
            {(accountType) =>
              accountType === "credit_card" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <form.Field name="cardNetwork">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel htmlFor={field.name}>
                          Card network
                        </FieldLabel>
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value || null)
                          }
                          value={field.state.value ?? ""}
                        />
                        {field.state.meta.errors.map((error) => (
                          <FieldError key={error?.message} match>
                            {error?.message}
                          </FieldError>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="cardLastFour">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel htmlFor={field.name}>
                          Last four digits
                        </FieldLabel>
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          inputMode="numeric"
                          maxLength={4}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value || null)
                          }
                          value={field.state.value ?? ""}
                        />
                        {field.state.meta.errors.map((error) => (
                          <FieldError key={error?.message} match>
                            {error?.message}
                          </FieldError>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="creditLimit">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel htmlFor={field.name}>
                          Credit limit
                        </FieldLabel>
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          inputMode="decimal"
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value || null)
                          }
                          value={field.state.value ?? ""}
                        />
                        {field.state.meta.errors.map((error) => (
                          <FieldError key={error?.message} match>
                            {error?.message}
                          </FieldError>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="statementClosingDay">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel htmlFor={field.name}>
                          Statement closing day
                        </FieldLabel>
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          inputMode="numeric"
                          max={31}
                          min={1}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          }
                          type="number"
                          value={field.state.value ?? ""}
                        />
                        {field.state.meta.errors.map((error) => (
                          <FieldError key={error?.message} match>
                            {error?.message}
                          </FieldError>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="paymentDueDay">
                    {(field) => (
                      <Field name={field.name}>
                        <FieldLabel htmlFor={field.name}>
                          Payment due day
                        </FieldLabel>
                        <Input
                          aria-invalid={
                            field.state.meta.errors.length > 0 || undefined
                          }
                          id={field.name}
                          inputMode="numeric"
                          max={31}
                          min={1}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value === ""
                                ? null
                                : Number(event.target.value)
                            )
                          }
                          type="number"
                          value={field.state.value ?? ""}
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
              ) : null
            }
          </form.Subscribe>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="openingBalance">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Opening balance</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
            <form.Field name="openingBalanceDate">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Effective date</FieldLabel>
                  <DatePicker
                    id={field.name}
                    onValueChange={(value) => field.handleChange(value)}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </div>

          <form.Field name="institution">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Institution</FieldLabel>
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="ownerMemberIds">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>Owners</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => {
                    const selected = field.state.value.includes(member.id);
                    return (
                      <Button
                        aria-pressed={selected}
                        key={member.id}
                        onClick={() =>
                          field.handleChange(
                            selected
                              ? field.state.value.filter(
                                  (id) => id !== member.id
                                )
                              : [...field.state.value, member.id]
                          )
                        }
                        size="sm"
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {member.user.name}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-muted-foreground text-xs">
                  Leave empty for a joint household account.
                </p>
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
              </Field>
            )}
          </form.Field>

          <form.Field name="includeInNetWorth">
            {(field) => (
              <Field name={field.name}>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.state.value}
                    id={field.name}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Include this account in net worth
                  </FieldLabel>
                </div>
              </Field>
            )}
          </form.Field>

          <DialogFooter variant="bare">
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  type="submit"
                >
                  {editing ? "Save changes" : "Create account"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
};

const AccountTable = ({
  accounts,
  canArchive,
  canRestore,
  canUpdate,
  currencies,
  defaultCurrency,
  members,
  onArchive,
  onRestore,
}: {
  accounts: FinancialAccount[];
  canArchive: boolean;
  canRestore: boolean;
  canUpdate: boolean;
  currencies: Currency[];
  defaultCurrency: string;
  members: AccountMember[];
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Account</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Balance</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {accounts.map((account) => {
        const archived = account.archivedAt !== null;
        return (
          <TableRow key={account.id}>
            <TableCell>
              <Link
                className="font-medium underline-offset-4 hover:underline"
                params={{ accountId: account.id }}
                to="/accounts/$accountId"
              >
                {account.name}
              </Link>
              {account.institution ? (
                <div className="text-muted-foreground text-xs">
                  {account.institution}
                </div>
              ) : null}
            </TableCell>
            <TableCell>{ACCOUNT_TYPE_LABELS[account.accountType]}</TableCell>
            <TableCell>
              <span className="tabular-nums">
                {formatBalance(account.balance, account.currencyCode)}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={archived ? "outline" : "default"}>
                {archived ? "Archived" : "Active"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                {canUpdate && !archived ? (
                  <AccountFormDialog
                    account={account}
                    activeOrganizationId={account.organizationId}
                    canCreate={false}
                    canUpdate={canUpdate}
                    currencies={currencies}
                    defaultCurrency={defaultCurrency}
                    members={members}
                  />
                ) : null}
                {archived && canRestore ? (
                  <Button
                    onClick={() => onRestore(account.id)}
                    size="sm"
                    variant="outline"
                  >
                    Restore
                  </Button>
                ) : null}
                {!archived && canArchive ? (
                  <Button
                    onClick={() => onArchive(account.id)}
                    size="sm"
                    variant="ghost"
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

export const AccountManager = ({
  activeOrganizationId,
  canArchive,
  canCreate,
  canRestore,
  canUpdate,
  defaultCurrency,
  members,
}: {
  activeOrganizationId: string;
  canArchive: boolean;
  canCreate: boolean;
  canRestore: boolean;
  canUpdate: boolean;
  defaultCurrency: string;
  members: AccountMember[];
}) => {
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsQueryOptions(activeOrganizationId));
  const currencies = useQuery(currenciesQueryOptions());
  const [showArchived, setShowArchived] = useState(false);
  const archiveMutation = useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.accounts.restore({ accountId: id })
        : client.accounts.archive({ accountId: id }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (_, { restore }) => {
      await invalidateAccounts(queryClient, activeOrganizationId);
      toastManager.add({
        title: restore ? "Account restored" : "Account archived",
        type: "success",
      });
    },
  });

  if (accounts.isPending || currencies.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (accounts.isError || currencies.isError) {
    return <p className="text-muted-foreground">Could not load accounts.</p>;
  }

  const visibleAccounts = showArchived
    ? accounts.data
    : accounts.data.filter((account) => account.archivedAt === null);
  const assets = visibleAccounts.filter(
    (account) => account.accountClass === "asset"
  );
  const liabilities = visibleAccounts.filter(
    (account) => account.accountClass === "liability"
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Track household assets, liabilities, and balance history.
          </CardDescription>
        </div>
        {canCreate ? (
          <AccountFormDialog
            activeOrganizationId={activeOrganizationId}
            canCreate={canCreate}
            canUpdate={canUpdate}
            currencies={currencies.data}
            defaultCurrency={defaultCurrency}
            members={members}
          />
        ) : null}
      </CardHeader>
      <CardPanel>
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => setShowArchived((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>
        {visibleAccounts.length === 0 ? (
          <Empty>
            <EmptyTitle>No accounts found</EmptyTitle>
            <EmptyDescription>
              Add a bank account, e-wallet, cash account, or investment to start
              tracking your household finances.
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="space-y-8">
            {assets.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-heading text-lg font-semibold">Assets</h2>
                <AccountTable
                  accounts={assets}
                  canArchive={canArchive}
                  canRestore={canRestore}
                  canUpdate={canUpdate}
                  currencies={currencies.data}
                  defaultCurrency={defaultCurrency}
                  members={members}
                  onArchive={(id) =>
                    archiveMutation.mutate({ id, restore: false })
                  }
                  onRestore={(id) =>
                    archiveMutation.mutate({ id, restore: true })
                  }
                />
              </section>
            ) : null}
            {liabilities.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-heading text-lg font-semibold">
                  Liabilities
                </h2>
                <AccountTable
                  accounts={liabilities}
                  canArchive={canArchive}
                  canRestore={canRestore}
                  canUpdate={canUpdate}
                  currencies={currencies.data}
                  defaultCurrency={defaultCurrency}
                  members={members}
                  onArchive={(id) =>
                    archiveMutation.mutate({ id, restore: false })
                  }
                  onRestore={(id) =>
                    archiveMutation.mutate({ id, restore: true })
                  }
                />
              </section>
            ) : null}
          </div>
        )}
      </CardPanel>
    </Card>
  );
};

export { ACCOUNT_TYPE_LABELS, formatBalance };
