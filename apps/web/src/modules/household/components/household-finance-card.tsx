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
import {
  List,
  ListItem,
  ListItemContent,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
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
  defaultCurrency: z.string().trim().min(1, "Choose a currency"),
  timezone: z.string().trim().min(1, "Choose a timezone"),
});

const findItem = (items: PickerItem[], value: string) =>
  items.find((item) => item.value === value) ?? null;

const Picker = ({
  ariaLabel,
  id,
  items,
  onValueChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  id: string;
  items: PickerItem[];
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) => (
  <Combobox
    items={items}
    onValueChange={(item: PickerItem | null) =>
      onValueChange(item?.value ?? "")
    }
    value={findItem(items, value)}
  >
    <ComboboxInput aria-label={ariaLabel} id={id} placeholder={placeholder} />
    <ComboboxPopup>
      <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
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

/**
 * The household's money defaults. Every member sees them; only a role with
 * `organization:update` can change them, and that check is cosmetic —
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
        toastManager.add({ title: "Money defaults saved", type: "success" });
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
    <ListSection aria-label="Money defaults">
      <ListSectionHeader>Money defaults</ListSectionHeader>
      {canManage ? (
        <form
          className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-4 dark:ring-1"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="defaultCurrency">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Currency</FieldLabel>
                  <div className="w-full">
                    <Picker
                      ariaLabel="Default currency"
                      id={field.name}
                      items={currencyItems}
                      onValueChange={field.handleChange}
                      placeholder="Search currencies"
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
            <form.Field name="timezone">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Timezone</FieldLabel>
                  <div className="w-full">
                    <Picker
                      ariaLabel="Timezone"
                      id={field.name}
                      items={TIMEZONE_ITEMS}
                      onValueChange={field.handleChange}
                      placeholder="Search timezones"
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
          </div>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isDirty: state.isDirty,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isDirty, isSubmitting }) => (
              <div className="flex justify-end">
                <Button
                  disabled={!(canSubmit && isDirty)}
                  loading={isSubmitting}
                  type="submit"
                >
                  Save changes
                </Button>
              </div>
            )}
          </form.Subscribe>
        </form>
      ) : (
        <List>
          <ListItem className="min-h-12">
            <ListItemContent>
              <span className="text-muted-foreground text-sm">Currency</span>
            </ListItemContent>
            <ListItemTrailing>
              {currencyLabel(profile.defaultCurrency)} (
              {profile.defaultCurrency.symbolNative})
            </ListItemTrailing>
          </ListItem>
          <ListItem className="min-h-12">
            <ListItemContent>
              <span className="text-muted-foreground text-sm">Timezone</span>
            </ListItemContent>
            <ListItemTrailing>
              {profile.timezone.replaceAll("_", " ")}
            </ListItemTrailing>
          </ListItem>
        </List>
      )}
      <ListSectionFooter>
        New accounts start in this currency; “today” follows this timezone.
      </ListSectionFooter>
    </ListSection>
  );
};
