import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_TYPES,
  LIQUIDITY_TYPES,
} from "@masdan/api/accounts/constants";
import type { AccountType } from "@masdan/api/accounts/constants";
import {
  cardNetworkLabel,
  resolveCardNetwork,
} from "@masdan/card-catalog/catalog";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldLabel } from "@masdan/ui/components/field";
import { IconTile } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Switch } from "@masdan/ui/components/switch";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { ColorSelector } from "@/components/color-selector";
import { DatePicker } from "@/components/date-picker";
import { FieldErrors } from "@/components/field-errors";
import {
  NetworkMark,
  networkMarkLabel,
} from "@/components/finance/network-mark";
import type { NetworkMarkKind } from "@/components/finance/network-mark";
import { MoreOptions } from "@/components/more-options";
import { householdToday } from "@/lib/household-date";
import {
  FormActions,
  trimDecimal,
} from "@/modules/transactions/components/transaction-form";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc, orpc } from "@/utils/orpc";
import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

import { cardCountriesOf, useCardCatalog } from "../card-catalog";
import { LIQUIDITY_LABELS, accountKind } from "../kinds";
import { CardProductPicker } from "./card-product-picker";
import { IssuerField } from "./issuer-field";

export type AccountDetail = RouterOutputs["accounts"]["get"];

export interface AccountComposerRequest {
  account?: AccountDetail;
  accountType?: AccountType;
}

/** What a new account defaults to, and who can own one. */
export interface AccountDefaults {
  currency: string | null;
  members: { id: string; user: { name: string } }[];
  timezone: string;
}

const nonNegativeDecimal = /^\d+(?<fraction>\.\d{1,6})?$/u;
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const CARD_NETWORKS: NetworkMarkKind[] = [
  "visa",
  "mastercard",
  "amex",
  "jcb",
  "unionpay",
  "discover",
];

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
    cardProductKey: z.string().nullable(),
    color: z.string().nullable(),
    creditLimit: z
      .string()
      .trim()
      .regex(nonNegativeDecimal, "Use a non-negative amount")
      .nullable(),
    currencyCode: z.string().length(3, "Choose a currency"),
    includeInNetWorth: z.boolean(),
    institution: z.string().max(120),
    liquidity: z.enum(LIQUIDITY_TYPES).nullable(),
    name: z.string().trim().min(1, "Give the account a name").max(120),
    notes: z.string().max(2000),
    // Empty means zero: a new account often starts with nothing in it.
    openingBalance: z
      .string()
      .trim()
      .regex(/^-?\d+(?<fraction>\.\d{1,6})?$/u, "Use a valid amount")
      .or(z.literal("")),
    openingBalanceDate: z.string().min(1, "Choose a date"),
    ownerMemberIds: z.array(z.string()),
    paymentDueDay: z.number().int().min(1).max(31).nullable(),
    statementClosingDay: z.number().int().min(1).max(31).nullable(),
  })
  .refine(
    (value) => value.accountClass === "asset" || value.liquidity === null,
    {
      message: "Liabilities have no liquidity",
      path: ["liquidity"],
    }
  );

type AccountFormValues = z.infer<typeof accountSchema>;

// oxlint-disable-next-line complexity
export const AccountForm = ({
  account,
  activeOrganizationId,
  accountType,
  defaults: household,
  onBack,
  onClose,
  onOpenAccount,
}: {
  account?: AccountDetail;
  activeOrganizationId: string;
  accountType: AccountType;
  defaults: AccountDefaults;
  onBack?: () => void;
  onClose: () => void;
  onOpenAccount?: (accountId: string) => void;
}) => {
  const queryClient = useQueryClient();
  const currencies = useQuery(
    orpc.currencies.list.queryOptions({ staleTime: Number.POSITIVE_INFINITY })
  );
  const { accounts } = householdOrpc(activeOrganizationId);
  const create = useMutation(accounts.create.mutationOptions());
  const update = useMutation(accounts.update.mutationOptions());
  const editing = account !== undefined;
  const kind = accountKind(accountType);
  const savedProductKey = account?.cardProductKey ?? null;
  const catalog = useCardCatalog(
    cardCountriesOf({
      cardProductKey: savedProductKey,
      currencyCode: household.currency,
    })
  );

  const defaultValues: AccountFormValues = {
    accountClass: kind.accountClass,
    accountType,
    cardLastFour: account?.cardLastFour ?? null,
    cardNetwork: account?.cardNetwork ?? null,
    cardProductKey: account?.cardProductKey ?? null,
    color: account?.color ?? null,
    creditLimit: account?.creditLimit ? trimDecimal(account.creditLimit) : null,
    currencyCode: account?.currencyCode ?? household.currency ?? "",
    includeInNetWorth: account?.includeInNetWorth ?? true,
    institution: account?.institution ?? "",
    liquidity:
      kind.accountClass === "liability"
        ? null
        : ((account?.liquidity as AccountFormValues["liquidity"]) ??
          (kind.group === "cash" ? "liquid" : "illiquid")),
    name: account?.name ?? "",
    notes: account?.notes ?? "",
    openingBalance: account ? trimDecimal(account.openingBalance) || "0" : "",
    openingBalanceDate:
      account?.openingBalanceDate ?? householdToday(household.timezone),
    ownerMemberIds: account?.ownerMemberIds ?? [],
    paymentDueDay: account?.paymentDueDay ?? null,
    statementClosingDay: account?.statementClosingDay ?? null,
  };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const isCard = value.accountType === "credit_card";
      const payload = {
        ...value,
        cardLastFour: isCard ? value.cardLastFour : null,
        cardNetwork: isCard ? value.cardNetwork : null,
        cardProductKey: isCard ? value.cardProductKey : null,
        color: (value.color ??
          null) as RouterInputs["accounts"]["create"]["color"],
        creditLimit: isCard ? value.creditLimit : null,
        openingBalance: value.openingBalance || "0",
        paymentDueDay: isCard ? value.paymentDueDay : null,
        statementClosingDay: isCard ? value.statementClosingDay : null,
      };
      // The mutation cache toasts the failure; the form keeps its values.
      const saved = await (
        account
          ? update.mutateAsync({ ...payload, accountId: account.id })
          : create.mutateAsync(payload)
      ).catch(() => null);
      if (!saved) {
        return;
      }
      await invalidate(queryClient, activeOrganizationId, "accounts");
      onClose();
      toastManager.add({
        actionProps:
          editing || !onOpenAccount
            ? undefined
            : { children: "Open", onClick: () => onOpenAccount(saved.id) },
        title: editing ? "Account updated" : `${saved.name} added`,
        type: "success",
      });
    },
    validators: { onSubmit: accountSchema },
  });

  if (currencies.isPending) {
    return <Skeleton className="h-64 w-full" radius="2xl" />;
  }

  const isCard = accountType === "credit_card";
  const isLiability = kind.accountClass === "liability";
  const opensAdvanced =
    editing && (account.notes !== null || account.ownerMemberIds.length > 0);

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
      <div className="flex items-center gap-3">
        <IconTile tint={kind.color} size="lg">
          <HugeiconsIcon icon={kind.icon} strokeWidth={1.8} />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold">{kind.label}</span>
          <span className="text-muted-foreground text-xs">
            {kind.description}
          </span>
        </div>
        {onBack ? (
          <Button onClick={onBack} size="sm" variant="ghost">
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            Change
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <form.Field name="name">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={
                  isCard ? "e.g. BPI Amore Visa" : "e.g. BPI Savings"
                }
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="institution">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={isCard ? undefined : field.name}>
                Institution
              </FieldLabel>
              {isCard ? (
                <form.Subscribe selector={(state) => state.values.currencyCode}>
                  {(currencyCode) => (
                    <IssuerField
                      currencyCode={currencyCode}
                      onBlur={field.handleBlur}
                      onChange={field.handleChange}
                      value={field.state.value}
                    />
                  )}
                </form.Subscribe>
              ) : (
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Optional"
                  value={field.state.value}
                />
              )}
            </Field>
          )}
        </form.Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <form.Field name="openingBalance">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>
                {isLiability ? "Amount owed" : "Balance"}
              </FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                numeric
                id={field.name}
                inputMode="decimal"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="0.00"
                value={field.state.value}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="currencyCode">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel>Currency</FieldLabel>
              <Select
                onValueChange={(value) =>
                  field.handleChange(typeof value === "string" ? value : "")
                }
                value={field.state.value || null}
              >
                <SelectTrigger aria-label="Currency" className="sm:w-28">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectPopup>
                  {(currencies.data ?? []).map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} · {currency.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldErrors errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </div>
      <form.Field name="openingBalanceDate">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>As of</FieldLabel>
            <div className="w-full">
              <DatePicker
                id={field.name}
                onValueChange={field.handleChange}
                value={field.state.value}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Transactions dated from this day on adjust the balance.
            </p>
          </Field>
        )}
      </form.Field>

      {isCard ? (
        <section className="bg-card dark:ring-hairline flex flex-col gap-5 rounded-2xl p-4 dark:ring-1">
          <h3 className="text-base font-semibold">Card details</h3>
          <form.Field
            name="cardProductKey"
            validators={{
              // Not in the form schema: a submit-time error there stays stuck
              // after the bank, network or card is fixed, disabling Save.
              onChange: ({ fieldApi, value }) =>
                catalog.productIssue(
                  {
                    cardNetwork: fieldApi.form.getFieldValue("cardNetwork"),
                    cardProductKey: value,
                    institution: fieldApi.form.getFieldValue("institution"),
                  },
                  savedProductKey
                ) ?? undefined,
              onChangeListenTo: ["cardNetwork", "institution"],
            }}
          >
            {(productField) => (
              <form.Subscribe
                selector={(state) => ({
                  cardLastFour: state.values.cardLastFour,
                  cardNetwork: state.values.cardNetwork,
                  color: state.values.color ?? kind.color,
                  currencyCode: state.values.currencyCode,
                  institution: state.values.institution,
                  name: state.values.name,
                })}
              >
                {(identity) => (
                  <CardProductPicker
                    identity={identity}
                    onSelect={(product) => {
                      productField.handleChange(product?.key ?? null);
                      if (!product) {
                        return;
                      }
                      // Picking a card deliberately picks its bank and network.
                      const issuer = catalog.findIssuer(product.issuerKey);
                      if (
                        issuer &&
                        catalog.resolveIssuer(identity.institution, [
                          issuer.country,
                        ])?.key !== issuer.key
                      ) {
                        form.setFieldValue("institution", issuer.name);
                      }
                      const network = cardNetworkLabel(product.network);
                      if (
                        network &&
                        resolveCardNetwork(identity.cardNetwork) !==
                          product.network
                      ) {
                        form.setFieldValue("cardNetwork", network);
                      }
                    }}
                    savedKey={savedProductKey}
                    value={productField.state.value}
                  />
                )}
              </form.Subscribe>
            )}
          </form.Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <form.Field name="creditLimit">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Credit limit</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    numeric
                    id={field.name}
                    inputMode="decimal"
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value || null)
                    }
                    placeholder="Optional"
                    value={field.state.value ?? ""}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="cardLastFour">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Last four digits</FieldLabel>
                  <Input
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    numeric
                    id={field.name}
                    inputMode="numeric"
                    maxLength={4}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value || null)
                    }
                    placeholder="••••"
                    value={field.state.value ?? ""}
                  />
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="statementClosingDay">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Statement closes on</FieldLabel>
                  <Select
                    onValueChange={(value) =>
                      field.handleChange(
                        typeof value === "number" ? value : null
                      )
                    }
                    value={field.state.value}
                  >
                    <SelectTrigger aria-label="Statement closing day">
                      <SelectValue placeholder="Day of month" />
                    </SelectTrigger>
                    <SelectPopup>
                      {DAYS.map((day) => (
                        <SelectItem key={day} value={day}>
                          Day {day}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
              )}
            </form.Field>
            <form.Field name="paymentDueDay">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Payment due on</FieldLabel>
                  <Select
                    onValueChange={(value) =>
                      field.handleChange(
                        typeof value === "number" ? value : null
                      )
                    }
                    value={field.state.value}
                  >
                    <SelectTrigger aria-label="Payment due day">
                      <SelectValue placeholder="Day of month" />
                    </SelectTrigger>
                    <SelectPopup>
                      {DAYS.map((day) => (
                        <SelectItem key={day} value={day}>
                          Day {day}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
              )}
            </form.Field>
          </div>
          <form.Subscribe
            selector={(state) =>
              catalog.findProduct(state.values.cardProductKey)
            }
          >
            {(product) => {
              // A catalog card fixes its network; only an unlisted card, or one
              // whose bank doesn't publish it, leaves the choice open.
              const locked = product !== null && product.network !== "unknown";
              return (
                <form.Field name="cardNetwork">
                  {(field) => (
                    <Field name={field.name}>
                      <FieldLabel>Network</FieldLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {CARD_NETWORKS.map((network) => {
                          const label = networkMarkLabel(network);
                          const selected =
                            resolveCardNetwork(field.state.value) === network;
                          return (
                            <button
                              aria-pressed={selected}
                              className="bg-secondary hover:bg-accent aria-pressed:bg-brand-soft aria-pressed:ring-brand focus-visible:ring-ring/50 text-foreground flex h-9 min-w-14 items-center justify-center rounded-xl px-3 transition duration-150 outline-none focus-visible:ring-3 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 aria-pressed:ring-2 aria-pressed:disabled:opacity-100 motion-reduce:active:scale-100"
                              disabled={locked}
                              key={network}
                              onClick={() =>
                                field.handleChange(selected ? null : label)
                              }
                              title={label}
                              type="button"
                            >
                              <NetworkMark
                                className={
                                  network === "mastercard" ? "h-5" : "h-3.5"
                                }
                                network={network}
                              />
                            </button>
                          );
                        })}
                      </div>
                      {locked ? (
                        <p className="text-muted-foreground text-xs">
                          Set by the card you picked.
                        </p>
                      ) : null}
                    </Field>
                  )}
                </form.Field>
              );
            }}
          </form.Subscribe>
        </section>
      ) : null}

      <MoreOptions defaultOpen={opensAdvanced}>
        <form.Field name="includeInNetWorth">
          {(field) => (
            <label
              className="bg-card flex items-center justify-between gap-4 rounded-xl px-4 py-3"
              htmlFor="net-worth"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">
                  Count toward net worth
                </span>
                <span className="text-muted-foreground text-xs">
                  Turn off for accounts you only track.
                </span>
              </span>
              <Switch
                checked={field.state.value}
                id="net-worth"
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </label>
          )}
        </form.Field>

        {isLiability ? null : (
          <form.Field name="liquidity">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel>How quickly can you use this money?</FieldLabel>
                <Tabs
                  className="w-full"
                  onValueChange={(value) =>
                    field.handleChange(value as AccountFormValues["liquidity"])
                  }
                  value={field.state.value}
                >
                  <TabsList aria-label="Liquidity" className="w-full">
                    {LIQUIDITY_TYPES.map((liquidity) => (
                      <TabsTab key={liquidity} value={liquidity}>
                        {LIQUIDITY_LABELS[liquidity]}
                      </TabsTab>
                    ))}
                  </TabsList>
                </Tabs>
              </Field>
            )}
          </form.Field>
        )}

        {household.members.length > 1 ? (
          <form.Field name="ownerMemberIds">
            {(field) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-muted-foreground mb-2 text-xs font-medium">
                  Owners
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {household.members.map((member) => {
                    const selected = field.state.value.includes(member.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className="bg-secondary hover:bg-accent aria-pressed:bg-brand-soft aria-pressed:text-brand-text focus-visible:ring-ring/50 h-7 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
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
                        type="button"
                      >
                        {member.user.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-muted-foreground text-xs">
                  Leave everyone unselected for a joint account.
                </p>
              </fieldset>
            )}
          </form.Field>
        ) : null}

        <form.Subscribe
          selector={(state) =>
            isCard && catalog.findProduct(state.values.cardProductKey) !== null
          }
        >
          {(hasCardDesign) =>
            // A catalog card brings its own design, so a colour would be ignored.
            hasCardDesign ? null : (
              <form.Field name="color">
                {(field) => (
                  <Field name={field.name}>
                    <FieldLabel>Color</FieldLabel>
                    <ColorSelector
                      legend="Account color"
                      onValueChange={(value: string) =>
                        field.handleChange(value)
                      }
                      value={field.state.value ?? kind.color}
                    />
                  </Field>
                )}
              </form.Field>
            )
          }
        </form.Subscribe>

        <form.Field name="notes">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
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
      </MoreOptions>

      <form.Subscribe
        selector={(state) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ canSubmit, isSubmitting }) => (
          <FormActions>
            <Button onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button disabled={!canSubmit} loading={isSubmitting} type="submit">
              {editing ? "Save" : "Add account"}
            </Button>
          </FormActions>
        )}
      </form.Subscribe>
    </form>
  );
};
