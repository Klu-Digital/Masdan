import {
  CheckmarkCircle02Icon,
  FileImportIcon,
  PlusSignIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { IconTile } from "@masdan/ui/components/icon-tile";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { z } from "zod";

import { useAppActions } from "@/components/app-actions";
import { BrandMark } from "@/components/brand-mark";
import { Amount } from "@/components/finance/amount";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient } from "@/lib/auth-client";
import { invalidateOrganizations } from "@/lib/organization";
import { AccountTile } from "@/modules/accounts/components/account-row";
import type { Currency } from "@/modules/currency/types";
import {
  Picker,
  TIMEZONE_ITEMS,
  currencyLabel,
} from "@/modules/household/components/household-finance-card";
import type { HouseholdFinanceProfile } from "@/modules/household/components/household-finance-card";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc, orpc } from "@/utils/orpc";

export const ONBOARDING_STEPS = ["household", "account", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const MIN_HOUSEHOLD_NAME_LENGTH = 2;
const HOUSEHOLD_FORM_ID = "onboarding-household";

const householdSchema = z.object({
  defaultCurrency: z.string().trim().min(1, "Choose a currency"),
  name: z
    .string()
    .trim()
    .min(
      MIN_HOUSEHOLD_NAME_LENGTH,
      `Use at least ${MIN_HOUSEHOLD_NAME_LENGTH} characters`
    ),
  timezone: z.string().trim().min(1, "Choose a timezone"),
});

// Every household starts on the server's default zone, rarely the person's own.
export const suggestedTimezone = (fallback: string): string => {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_ITEMS.some((item) => item.value === detected)
    ? detected
    : fallback;
};

const StepShell = ({
  children,
  description,
  footer,
  step,
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  footer: ReactNode;
  step: OnboardingStep;
  title: string;
}) => {
  const position = ONBOARDING_STEPS.indexOf(step) + 1;
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <span className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="text-base font-semibold">Masdan</span>
        </span>
        <span className="flex items-center gap-1">
          {step === "done" ? null : (
            <Button render={<Link to="/dashboard" />} size="sm" variant="ghost">
              Skip setup
            </Button>
          )}
          <ModeToggle />
        </span>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-12 pb-16 md:pt-20">
        <div
          className="animate-enter flex w-full max-w-lg flex-col gap-7"
          key={step}
        >
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Step {position} of {ONBOARDING_STEPS.length}
            </span>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
};

const HouseholdStep = ({
  activeOrganizationId,
  currencies,
  name,
  onContinue,
  profile,
}: {
  activeOrganizationId: string;
  currencies: Currency[];
  name: string;
  onContinue: () => void;
  profile: HouseholdFinanceProfile;
}) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const updateProfile = useMutation(
    householdOrpc(
      activeOrganizationId
    ).households.updateProfile.mutationOptions()
  );
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
      name,
      timezone: suggestedTimezone(profile.timezone),
    },
    onSubmit: async ({ value }) => {
      const trimmed = value.name.trim();
      if (trimmed !== name) {
        const { error } = await authClient.organization.update({
          data: { name: trimmed },
          organizationId: activeOrganizationId,
        });
        if (error) {
          toastManager.add({
            title: error.message ?? "Could not rename the household",
            type: "error",
          });
          return;
        }
        await invalidateOrganizations(queryClient);
        await router.invalidate();
      }
      // The mutation cache toasts the failure; the form keeps its values.
      const updated = await updateProfile
        .mutateAsync({
          defaultCurrency: value.defaultCurrency,
          timezone: value.timezone,
        })
        .catch(() => null);
      if (!updated) {
        return;
      }
      await invalidate(queryClient, activeOrganizationId, "households");
      onContinue();
    },
    validators: { onSubmit: householdSchema },
  });

  return (
    <StepShell
      description="Name the household and pick the currency and timezone its money is counted in. You can change these later in settings."
      footer={
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              disabled={!canSubmit}
              form={HOUSEHOLD_FORM_ID}
              loading={isSubmitting}
              size="lg"
              type="submit"
            >
              Continue
            </Button>
          )}
        </form.Subscribe>
      }
      step="household"
      title="Set up your household"
    >
      <form
        className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-4 sm:p-5 dark:ring-1"
        id={HOUSEHOLD_FORM_ID}
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
              <FieldLabel htmlFor="onboarding-household-name">
                Household name
              </FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                id="onboarding-household-name"
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
        <form.Field name="defaultCurrency">
          {(field) => (
            <Field name={field.name}>
              <FieldLabel htmlFor="onboarding-currency">Currency</FieldLabel>
              <div className="w-full">
                <Picker
                  ariaLabel="Default currency"
                  id="onboarding-currency"
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
              <FieldLabel htmlFor="onboarding-timezone">Timezone</FieldLabel>
              <div className="w-full">
                <Picker
                  ariaLabel="Timezone"
                  id="onboarding-timezone"
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
      </form>
    </StepShell>
  );
};

const AccountStep = ({
  activeOrganizationId,
  onContinue,
}: {
  activeOrganizationId: string;
  onContinue: () => void;
}) => {
  const { composeAccount } = useAppActions();
  const accounts = useQuery(
    householdOrpc(activeOrganizationId).accounts.list.queryOptions()
  );
  const added = accounts.data ?? [];

  return (
    <StepShell
      description="Start with the one you use most, like a bank account, e-wallet or credit card. Its balance today is enough; history can come later."
      footer={
        <>
          <Button
            onClick={onContinue}
            size="lg"
            variant={added.length > 0 ? "default" : "ghost"}
          >
            {added.length > 0 ? "Continue" : "Skip for now"}
          </Button>
          {added.length > 0 ? null : (
            <Button onClick={() => composeAccount()} size="lg">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              Add an account
            </Button>
          )}
        </>
      }
      step="account"
      title="Add your first account"
    >
      {accounts.isPending ? (
        <Skeleton className="h-20 w-full" radius="2xl" />
      ) : null}
      {added.length > 0 ? (
        <List aria-label="Your accounts">
          {added.map((account) => (
            <ListItem key={account.id}>
              <ListItemLeading>
                <AccountTile account={account} />
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>{account.name}</ListItemTitle>
              </ListItemContent>
              <ListItemTrailing>
                <Amount
                  currency={account.currencyCode}
                  value={account.balance}
                  weight="medium"
                />
              </ListItemTrailing>
            </ListItem>
          ))}
          <ListItemButton onClick={() => composeAccount()}>
            <ListItemLeading>
              <IconTile>
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </IconTile>
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>Add another account</ListItemTitle>
            </ListItemContent>
          </ListItemButton>
        </List>
      ) : null}
    </StepShell>
  );
};

const DoneStep = ({ householdName }: { householdName: string }) => (
  <StepShell
    description={`${householdName} is ready. Your overview fills in as you record or import transactions.`}
    footer={
      <Button render={<Link to="/dashboard" />} size="lg">
        Go to your overview
      </Button>
    }
    step="done"
    title="You’re all set"
  >
    <List>
      <ListItem render={<Link to="/categories" />}>
        <ListItemLeading>
          <IconTile tint="green">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} />
          </IconTile>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>Categories are ready</ListItemTitle>
          <ListItemDescription>
            A starter set of income and expense categories to tidy up whenever
            you like.
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing chevron />
      </ListItem>
      <ListItem render={<Link to="/imports" />}>
        <ListItemLeading>
          <IconTile tint="orange">
            <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
          </IconTile>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>Import from CSV</ListItemTitle>
          <ListItemDescription>
            Bring in a bank or card export instead of typing it.
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing chevron />
      </ListItem>
      <ListItem render={<Link to="/settings/household" />}>
        <ListItemLeading>
          <IconTile tint="violet">
            <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} />
          </IconTile>
        </ListItemLeading>
        <ListItemContent>
          <ListItemTitle>Invite your household</ListItemTitle>
          <ListItemDescription>
            Share accounts and spending with a partner or family.
          </ListItemDescription>
        </ListItemContent>
        <ListItemTrailing chevron />
      </ListItem>
    </List>
  </StepShell>
);

const Loading = () => (
  <div
    aria-busy="true"
    className="flex min-h-svh items-start justify-center px-5 pt-24"
  >
    <Skeleton className="h-80 w-full max-w-lg" radius="2xl" />
  </div>
);

export const OnboardingPage = ({
  activeOrganizationId,
  householdName,
  onStep,
  profile,
  step,
}: {
  activeOrganizationId: string;
  householdName: string;
  onStep: (step: OnboardingStep) => void;
  profile: HouseholdFinanceProfile;
  step: OnboardingStep;
}) => {
  const currencies = useQuery(
    orpc.currencies.list.queryOptions({ staleTime: Number.POSITIVE_INFINITY })
  );

  if (step === "account") {
    return (
      <AccountStep
        activeOrganizationId={activeOrganizationId}
        onContinue={() => onStep("done")}
      />
    );
  }
  if (step === "done") {
    return <DoneStep householdName={householdName} />;
  }
  if (!currencies.data) {
    return <Loading />;
  }
  return (
    <HouseholdStep
      activeOrganizationId={activeOrganizationId}
      currencies={currencies.data}
      name={householdName}
      onContinue={() => onStep("account")}
      profile={profile}
    />
  );
};
