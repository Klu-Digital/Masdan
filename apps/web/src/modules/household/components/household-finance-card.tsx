import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
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
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";

import type { Currency } from "@/modules/currency/queries";
import { invalidateHouseholdProfile } from "@/modules/household/queries";
import { client } from "@/utils/orpc";

interface PickerItem {
  label: string;
  value: string;
}

export interface HouseholdFinanceProfile {
  defaultCurrency: Currency;
  timezone: string;
}

/**
 * Read from the runtime rather than a table: tzdb ships several releases a year
 * and ICU is the list the formatting actually uses. The server validates
 * against its own copy of the same list.
 */
const TIMEZONE_ITEMS: PickerItem[] = Intl.supportedValuesOf("timeZone").map(
  (zone) => ({ label: zone.replaceAll("_", " "), value: zone })
);

const currencyLabel = (currency: Currency) =>
  `${currency.code} — ${currency.name}`;

const financeProfileSchema = z.object({
  defaultCurrency: z.string().trim().min(1, "Pick a currency"),
  timezone: z.string().trim().min(1, "Pick a timezone"),
});

const findItem = (items: PickerItem[], value: string) =>
  items.find((item) => item.value === value) ?? null;

/**
 * The finance profile of the active household. Every member sees it; only a
 * role with `organization:update` gets the form, and that check is cosmetic —
 * `households.updateProfile` is the authority.
 */
export const HouseholdFinanceCard = ({
  activeOrganizationId,
  canManage,
  currencies,
  profile,
}: {
  activeOrganizationId: string;
  canManage: boolean;
  currencies: Currency[];
  profile: HouseholdFinanceProfile;
}) => {
  const queryClient = useQueryClient();
  const currencyItems = useMemo(
    () =>
      currencies.map((currency) => ({
        label: currencyLabel(currency),
        value: currency.code,
      })),
    [currencies]
  );

  const form = useForm({
    defaultValues: {
      defaultCurrency: profile.defaultCurrency.code,
      timezone: profile.timezone,
    },
    onSubmit: async ({ value }) => {
      try {
        const updated = await client.households.updateProfile(value);
        form.reset({
          defaultCurrency: updated.defaultCurrency.code,
          timezone: updated.timezone,
        });
        await invalidateHouseholdProfile(queryClient, activeOrganizationId);
        toastManager.add({
          title: "Household settings saved",
          type: "success",
        });
      } catch (error) {
        toastManager.add({
          title:
            error instanceof Error
              ? error.message
              : "Could not save household settings",
          type: "error",
        });
      }
    },
    validators: { onSubmit: financeProfileSchema },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial settings</CardTitle>
        <CardDescription>
          Defaults for this household&apos;s accounts, transactions and reports.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {canManage ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              form.handleSubmit();
            }}
          >
            <form.Field name="defaultCurrency">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Default currency</FieldLabel>
                  <Combobox
                    items={currencyItems}
                    onValueChange={(item: PickerItem | null) =>
                      field.handleChange(item?.value ?? "")
                    }
                    value={findItem(currencyItems, field.state.value)}
                  >
                    <ComboboxInput
                      aria-label="Default currency"
                      id={field.name}
                      placeholder="Search currencies"
                    />
                    <ComboboxPopup>
                      <ComboboxEmpty>No matching currency.</ComboboxEmpty>
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
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>
            <form.Field name="timezone">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Timezone</FieldLabel>
                  <Combobox
                    items={TIMEZONE_ITEMS}
                    onValueChange={(item: PickerItem | null) =>
                      field.handleChange(item?.value ?? "")
                    }
                    value={findItem(TIMEZONE_ITEMS, field.state.value)}
                  >
                    <ComboboxInput
                      aria-label="Timezone"
                      id={field.name}
                      placeholder="Search timezones"
                    />
                    <ComboboxPopup>
                      <ComboboxEmpty>No matching timezone.</ComboboxEmpty>
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
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
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
                <Button
                  className="sm:col-span-2 sm:justify-self-start"
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  type="submit"
                >
                  Save financial settings
                </Button>
              )}
            </form.Subscribe>
          </form>
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Default currency</dt>
              <dd className="font-medium">
                {currencyLabel(profile.defaultCurrency)} (
                {profile.defaultCurrency.symbolNative})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd className="font-medium">{profile.timezone}</dd>
            </div>
          </dl>
        )}
      </CardPanel>
    </Card>
  );
};
