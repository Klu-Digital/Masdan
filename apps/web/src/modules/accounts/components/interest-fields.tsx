import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { scheduleOn, termsOffered } from "@masdan/api/interest/catalog";
import {
  CALCULATION_BASES,
  CREDIT_FREQUENCIES,
  DAY_COUNT_BASES,
  TIER_MODES,
} from "@masdan/api/interest/constants";
import type { InterestTerms } from "@masdan/api/interest/constants";
import { maturityFor } from "@masdan/api/interest/engine";
import { normalizeCardText } from "@masdan/card-catalog/catalog";
import { Button } from "@masdan/ui/components/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Switch } from "@masdan/ui/components/switch";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";

import { DatePicker } from "@/components/date-picker";
import { InstitutionLogo } from "@/components/finance/institution-logo";

import {
  BASIS_LABELS,
  CREDIT_LABELS,
  DAY_COUNT_LABELS,
  PRODUCT_TYPE_LABELS,
  TIER_MODE_LABELS,
  headlineRate,
  termKey,
  termLabel,
} from "../interest";
import type { CatalogProduct, InterestCatalog } from "../interest";
import { EMPTY_TERMS, draftTerms, termOfKey } from "../interest-draft";
import type { InterestDraft, TermsDraft } from "../interest-draft";
import { InterestTermsView } from "./interest-terms";

interface Option {
  key: string;
  label: string;
  mode: InterestDraft["mode"];
  product: CatalogProduct | null;
  search: string;
}

const NONE: Option = {
  key: "none",
  label: "No interest",
  mode: "none",
  product: null,
  search: "no interest none",
};

const CUSTOM: Option = {
  key: "custom",
  label: "Custom rate",
  mode: "custom",
  product: null,
  search: "custom rate other not listed",
};

const matches = (option: Option, query: string): boolean =>
  normalizeCardText(query)
    .split(" ")
    .every((word) => option.search.includes(word));

/** The terms a preset gives this placement: its tenor's, on its start date. */
const presetTerms = (
  product: CatalogProduct | null,
  draft: Pick<InterestDraft, "startDate" | "termKey">,
  today: string
): InterestTerms | null =>
  product
    ? (scheduleOn(
        product.schedules,
        termOfKey(draft.termKey),
        draft.startDate || today
      )?.terms ?? null)
    : null;

const RateSummary = ({
  currencyCode,
  product,
  terms,
}: {
  currencyCode: string;
  product: CatalogProduct | null;
  terms: InterestTerms;
}) => (
  <div className="bg-secondary/30 dark:ring-hairline rounded-2xl p-4 dark:ring-1">
    <InterestTermsView
      currency={currencyCode}
      source={product?.schedules.find((entry) => entry.terms === terms) ?? null}
      terms={terms}
    />
  </div>
);

const LabelledSelect = <T extends string>({
  label,
  labels,
  onChange,
  options,
  value,
}: {
  label: string;
  labels: Record<T, string>;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <Select
      onValueChange={(next) => {
        if (typeof next === "string") {
          onChange(next as T);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  </Field>
);

const TextField = ({
  id,
  label,
  onChange,
  placeholder = "Optional",
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input
      id={id}
      inputMode="decimal"
      numeric
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  </Field>
);

/** Every term a bank can set, for a custom rate or a preset's override. */
const TermsEditor = ({
  onChange,
  value,
}: {
  onChange: (value: TermsDraft) => void;
  value: TermsDraft;
}) => {
  const set = <K extends keyof TermsDraft>(key: K, next: TermsDraft[K]) =>
    onChange({ ...value, [key]: next });
  const setTier = (
    index: number,
    key: "annualRate" | "minBalance",
    next: string
  ) =>
    set(
      "tiers",
      value.tiers.map((tier, position) =>
        position === index ? { ...tier, [key]: next } : tier
      )
    );

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Rates</legend>
        {value.tiers.map((tier, index) => (
          // Tiers are positional: the first always starts at zero.
          // oxlint-disable-next-line react/no-array-index-key
          <div
            className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
            key={index}
          >
            <Input
              aria-label={`Tier ${index + 1} starts at balance`}
              inputMode="decimal"
              numeric
              onChange={(event) =>
                setTier(index, "minBalance", event.target.value)
              }
              placeholder="From balance"
              readOnly={index === 0}
              value={tier.minBalance}
            />
            <Input
              aria-label={`Tier ${index + 1} rate, percent a year`}
              inputMode="decimal"
              numeric
              onChange={(event) =>
                setTier(index, "annualRate", event.target.value)
              }
              placeholder="% p.a."
              value={tier.annualRate}
            />
            <Button
              aria-label={`Remove tier ${index + 1}`}
              disabled={index === 0}
              onClick={() =>
                set(
                  "tiers",
                  value.tiers.filter((_, position) => position !== index)
                )
              }
              size="icon"
              variant="ghost"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
            </Button>
          </div>
        ))}
        <div>
          <Button
            onClick={() =>
              set("tiers", [...value.tiers, { annualRate: "", minBalance: "" }])
            }
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            Add a balance tier
          </Button>
        </div>
        {value.tiers.length > 1 ? (
          <Tabs
            onValueChange={(next) =>
              set("tierMode", next as TermsDraft["tierMode"])
            }
            value={value.tierMode}
          >
            <TabsList aria-label="How tiers apply" className="w-full">
              {TIER_MODES.map((mode) => (
                <TabsTab key={mode} value={mode}>
                  {TIER_MODE_LABELS[mode]}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <LabelledSelect
          label="Interest is"
          labels={CREDIT_LABELS}
          onChange={(next) => set("creditFrequency", next)}
          options={CREDIT_FREQUENCIES}
          value={value.creditFrequency}
        />
        <LabelledSelect
          label="Calculated on"
          labels={BASIS_LABELS}
          onChange={(next) => set("calculationBasis", next)}
          options={CALCULATION_BASES}
          value={value.calculationBasis}
        />
        <LabelledSelect
          label="Day count"
          labels={DAY_COUNT_LABELS}
          onChange={(next) => set("dayCountBasis", next)}
          options={DAY_COUNT_BASES}
          value={value.dayCountBasis}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="interest-tax"
          label="Withholding tax %"
          onChange={(next) => set("withholdingTaxRate", next)}
          placeholder="20"
          value={value.withholdingTaxRate}
        />
        <TextField
          id="interest-minimum"
          label="Earns from balance"
          onChange={(next) => set("minimumBalance", next)}
          value={value.minimumBalance}
        />
        <TextField
          id="interest-cap"
          label="Stops earning above"
          onChange={(next) => set("interestCapBalance", next)}
          value={value.interestCapBalance}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <TextField
          id="interest-bonus"
          label="Bonus % p.a."
          onChange={(next) => set("bonusAnnualRate", next)}
          value={value.bonusAnnualRate}
        />
        <Field>
          <FieldLabel htmlFor="interest-condition">Bonus condition</FieldLabel>
          <Input
            id="interest-condition"
            onChange={(event) => set("conditionSummary", event.target.value)}
            placeholder="e.g. Keep ₱10,000 in savings every month"
            value={value.conditionSummary}
          />
        </Field>
      </div>
    </div>
  );
};

// oxlint-disable-next-line complexity
export const InterestFields = ({
  catalog,
  currencyCode,
  error,
  institutionId,
  onChange,
  onPickProduct,
  openingBalanceDate,
  today,
  value,
}: {
  catalog: InterestCatalog;
  currencyCode: string;
  error?: string;
  institutionId: string | null;
  onChange: (value: InterestDraft) => void;
  onPickProduct: (product: CatalogProduct) => void;
  openingBalanceDate: string;
  today: string;
  value: InterestDraft;
}) => {
  const institutions = new Map(
    catalog.institutions.map((row) => [row.id, row])
  );
  const product =
    catalog.products.find(({ id }) => id === value.productId) ?? null;
  const optionFor = (entry: CatalogProduct): Option => {
    const bank = institutions.get(entry.institutionId);
    const channel = entry.channelInstitutionId
      ? institutions.get(entry.channelInstitutionId)
      : undefined;
    return {
      key: entry.id,
      label: `${bank?.shortName ?? ""}${channel ? ` × ${channel.shortName}` : ""} · ${entry.name}`,
      mode: "preset",
      product: entry,
      search: normalizeCardText(
        [
          entry.name,
          ...entry.aliases,
          bank?.name ?? "",
          bank?.shortName ?? "",
          ...(bank?.aliases ?? []),
          channel?.name ?? "",
          PRODUCT_TYPE_LABELS[entry.productType],
        ].join(" ")
      ),
    };
  };
  // The account's own bank first; every other product stays one search away.
  const products = catalog.products
    .filter((entry) => entry.currencyCode === currencyCode)
    .toSorted(
      (left, right) =>
        Number(right.institutionId === institutionId) -
          Number(left.institutionId === institutionId) ||
        (institutions.get(left.institutionId)?.shortName ?? "").localeCompare(
          institutions.get(right.institutionId)?.shortName ?? ""
        )
    );
  const options = [NONE, ...products.map(optionFor), CUSTOM];
  let selected = NONE;
  if (value.mode === "custom") {
    selected = CUSTOM;
  } else if (product) {
    selected = optionFor(product);
  }

  const isDeposit = product?.productType === "time_deposit";
  const tenors = product ? termsOffered(product.schedules) : [];
  const preset = presetTerms(product, value, today);
  const ownTerms =
    value.mode === "custom" ||
    value.customize ||
    (value.mode === "preset" && product !== null && preset === null);
  const effective = ownTerms ? null : preset;
  const bonusOffered = ownTerms
    ? value.terms.bonusAnnualRate.trim() !== ""
    : Boolean(effective?.bonusAnnualRate);
  const placement =
    isDeposit ||
    (ownTerms &&
      (value.terms.creditFrequency === "maturity" ||
        value.terms.calculationBasis === "principal"));
  const start = value.startDate || openingBalanceDate;
  const term = termOfKey(value.termKey);
  const suggestedMaturity = term ? maturityFor(start, term) : "";

  const pick = (option: Option | null) => {
    const next = option ?? NONE;
    if (next.product) {
      onPickProduct(next.product);
    }
    onChange({
      ...value,
      customize: false,
      maturityDate: "",
      mode: next.mode,
      productId: next.product?.id ?? null,
      startDate:
        next.product?.productType === "time_deposit" ? openingBalanceDate : "",
      termKey: "",
      terms:
        next.mode === "custom" && value.mode !== "custom"
          ? EMPTY_TERMS
          : value.terms,
    });
  };

  return (
    <section
      aria-label="Interest"
      className="bg-card dark:ring-hairline flex flex-col gap-5 rounded-2xl p-4 dark:ring-1"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Interest</h3>
        <p className="text-muted-foreground text-xs">
          Estimated from the balance and the bank’s published rates.
        </p>
      </div>
      <Field>
        <FieldLabel>Product</FieldLabel>
        <Combobox
          filter={matches}
          isItemEqualToValue={(item: Option, current: Option) =>
            item.key === current.key
          }
          itemToStringLabel={(item: Option) => item.label}
          items={options}
          onValueChange={pick}
          value={selected}
        >
          <ComboboxInput
            aria-invalid={error ? true : undefined}
            placeholder="Search banks and products"
          />
          <ComboboxPopup>
            <ComboboxEmpty>No match. Choose “Custom rate”.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxCollection>
                {(option: Option) => {
                  const bank = option.product
                    ? institutions.get(option.product.institutionId)
                    : null;
                  const channel = option.product?.channelInstitutionId
                    ? institutions.get(option.product.channelInstitutionId)
                    : null;
                  const first = option.product?.schedules.at(-1)?.terms;
                  return (
                    <ComboboxItem key={option.key} value={option}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        {option.product ? (
                          <InstitutionLogo
                            channel={channel}
                            institution={bank ?? null}
                            size="sm"
                          />
                        ) : null}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{option.label}</span>
                          {option.product ? (
                            <span className="text-muted-foreground truncate text-xs">
                              {[
                                PRODUCT_TYPE_LABELS[option.product.productType],
                                first ? headlineRate(first) : "Enter your rate",
                              ].join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </ComboboxItem>
                  );
                }}
              </ComboboxCollection>
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
        {error ? <FieldError match>{error}</FieldError> : null}
        {product?.notes ? (
          <p className="text-muted-foreground text-xs">{product.notes}</p>
        ) : null}
      </Field>

      {isDeposit && tenors.length > 0 ? (
        <Field>
          <FieldLabel>Tenor</FieldLabel>
          <Select
            onValueChange={(next) => {
              if (typeof next === "string") {
                onChange({ ...value, maturityDate: "", termKey: next });
              }
            }}
            value={value.termKey || null}
          >
            <SelectTrigger aria-label="Tenor">
              <SelectValue placeholder="Choose a tenor" />
            </SelectTrigger>
            <SelectPopup>
              {tenors.map((tenor) => {
                const rate = product
                  ? scheduleOn(product.schedules, tenor, start)?.terms
                  : null;
                return (
                  <SelectItem key={termKey(tenor)} value={termKey(tenor)}>
                    {termLabel(tenor)}
                    {rate ? ` · ${headlineRate(rate)}` : ""}
                  </SelectItem>
                );
              })}
            </SelectPopup>
          </Select>
        </Field>
      ) : null}

      {placement ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="interest-start">Placed on</FieldLabel>
            <DatePicker
              id="interest-start"
              onValueChange={(next) =>
                onChange({ ...value, maturityDate: "", startDate: next })
              }
              value={start}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="interest-maturity">Matures on</FieldLabel>
            <DatePicker
              allowFutureYears
              id="interest-maturity"
              onValueChange={(next) =>
                onChange({ ...value, maturityDate: next })
              }
              value={value.maturityDate || suggestedMaturity}
            />
            {suggestedMaturity && !value.maturityDate ? (
              <p className="text-muted-foreground text-xs">
                From the tenor. Change it if the bank moved the date.
              </p>
            ) : null}
          </Field>
        </div>
      ) : null}

      {effective ? (
        <RateSummary
          currencyCode={currencyCode}
          product={product}
          terms={effective}
        />
      ) : null}
      {effective ? (
        <div>
          <Button
            onClick={() =>
              onChange({
                ...value,
                customize: true,
                terms: draftTerms(effective),
              })
            }
            size="sm"
            variant="ghost"
          >
            {isDeposit ? "Booked a different rate?" : "Use a different rate"}
          </Button>
        </div>
      ) : null}

      {ownTerms && value.mode !== "none" ? (
        <>
          {value.mode === "preset" && preset ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                Only this account uses these terms. The {product?.name} preset
                stays as it is.
              </p>
              <Button
                onClick={() => onChange({ ...value, customize: false })}
                size="xs"
                variant="ghost"
              >
                Use the preset
              </Button>
            </div>
          ) : null}
          <TermsEditor
            onChange={(terms) => onChange({ ...value, terms })}
            value={value.terms}
          />
        </>
      ) : null}

      {bonusOffered ? (
        <label
          className="bg-secondary/60 flex items-center justify-between gap-4 rounded-xl px-4 py-3"
          htmlFor="interest-bonus-eligible"
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium">Count the bonus rate</span>
            <span className="text-muted-foreground text-xs">
              {(ownTerms
                ? value.terms.conditionSummary
                : effective?.conditionSummary) ||
                "Turn on while the account meets the bank’s condition."}
            </span>
          </span>
          <Switch
            checked={value.bonusEligible}
            id="interest-bonus-eligible"
            onCheckedChange={(checked) =>
              onChange({ ...value, bonusEligible: checked })
            }
          />
        </label>
      ) : null}
      {value.mode === "none" ? null : (
        <label
          className="bg-secondary/60 flex items-center justify-between gap-4 rounded-xl px-4 py-3"
          htmlFor="interest-auto-post"
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium">
              Post interest automatically
            </span>
            <span className="text-muted-foreground text-xs">
              Adds each credit as Interest Income on its credit date. Turn off
              if you import the bank’s statements, or they’ll count it twice.
            </span>
          </span>
          <Switch
            checked={value.autoPost}
            id="interest-auto-post"
            onCheckedChange={(checked) =>
              onChange({ ...value, autoPost: checked })
            }
          />
        </label>
      )}
    </section>
  );
};
