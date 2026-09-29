import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PieChart01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { positiveAmount } from "@masdan/api/shared/money";
import { Amount } from "@masdan/ui/components/amount";
import { AmountInput } from "@masdan/ui/components/amount-input";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import type { MeterTone } from "@masdan/ui/components/meter";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Sensitive } from "@masdan/ui/components/sensitive";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Stat,
  StatDetail,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { toastManager } from "@masdan/ui/components/toast";
import { formatMoney, moneyParts, toNumber } from "@masdan/ui/lib/money";
import { useForm } from "@tanstack/react-form";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { addMonths, formatLongDate, formatMonthYear } from "@/lib/dates";
import {
  FormActions,
  trimDecimal,
} from "@/modules/transactions/components/transaction-form";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import type { BudgetLine, MonthBudgets } from "../types";

export interface BudgetPermissions {
  canClear: boolean;
  canUpdate: boolean;
}

const NEAR_LIMIT_PERCENT = 90;

const shiftMonth = (month: string, offset: number): string =>
  addMonths(`${month}-01`, offset).slice(0, 7);

const meterTone = (line: BudgetLine): MeterTone => {
  if (line.status === "overspent") {
    return "danger";
  }
  return (line.percentUsed ?? 0) >= NEAR_LIMIT_PERCENT ? "warning" : "brand";
};

const budgetSchema = z.object({ amount: positiveAmount });

/** Set, change or remove one category's budget for the month. */
const BudgetEditor = ({
  activeOrganizationId,
  canClear,
  line,
  month,
  onOpenChange,
  open,
}: {
  activeOrganizationId: string;
  canClear: boolean;
  line: BudgetLine;
  month: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const queryClient = useQueryClient();
  const { category } = line;
  const { budgets } = householdOrpc(activeOrganizationId);
  const clear = useMutation(
    budgets.clear.mutationOptions({
      onSuccess: async () => {
        await invalidate(queryClient, activeOrganizationId, "budgets");
        onOpenChange(false);
        toastManager.add({
          title: `${category.name} budget removed`,
          type: "success",
        });
      },
    })
  );
  const set = useMutation(
    budgets.set.mutationOptions({
      onSuccess: async () => {
        await invalidate(queryClient, activeOrganizationId, "budgets");
        onOpenChange(false);
        toastManager.add({
          title: `${category.name} budget saved`,
          type: "success",
        });
      },
    })
  );
  const form = useForm({
    defaultValues: { amount: trimDecimal(line.budget?.amount) },
    onSubmit: async ({ value }) => {
      // The mutation cache toasts the failure; the form keeps its values.
      await set
        .mutateAsync({
          amount: value.amount.trim(),
          categoryId: category.id,
          month,
        })
        .catch(() => null);
    },
    validators: { onSubmit: budgetSchema },
  });

  return (
    <ResponsiveSheet
      description={
        <>
          {formatMonthYear(month)} ·{" "}
          <Sensitive>{formatMoney(line.spent, line.currencyCode)}</Sensitive>{" "}
          spent
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={`${category.name} budget`}
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
        <form.Field name="amount">
          {(field) => (
            <Field className="items-stretch" name={field.name}>
              <FieldLabel className="sr-only" htmlFor={field.name}>
                Monthly budget
              </FieldLabel>
              <AmountInput
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                currencySymbol={moneyParts(0, line.currencyCode).currency}
                id={field.name}
                invalid={field.state.meta.errors.length > 0}
                onBlur={field.handleBlur}
                onValueChange={field.handleChange}
                value={field.state.value}
              />
              <div className="flex justify-center">
                {field.state.meta.errors.map((error) => (
                  <FieldError key={error?.message} match>
                    {error?.message}
                  </FieldError>
                ))}
              </div>
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
            <FormActions>
              {line.budget && canClear ? (
                <Button
                  className="me-auto"
                  loading={clear.isPending}
                  onClick={() =>
                    clear.mutate({ categoryId: category.id, month })
                  }
                  variant="destructive-outline"
                >
                  Remove budget
                </Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)} variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={!canSubmit || clear.isPending}
                loading={isSubmitting}
                type="submit"
              >
                Save budget
              </Button>
            </FormActions>
          )}
        </form.Subscribe>
      </form>
    </ResponsiveSheet>
  );
};

const OtherCurrencies = ({ line }: { line: BudgetLine }) =>
  line.otherCurrencies.length > 0 ? (
    <ListItemDescription>
      Also{" "}
      <Sensitive>
        {line.otherCurrencies
          .map((other) => formatMoney(other.total, other.currencyCode))
          .join(", ")}
      </Sensitive>{" "}
      in other currencies, not counted
    </ListItemDescription>
  ) : null;

const BudgetedRow = ({
  line,
  onEdit,
}: {
  line: BudgetLine;
  onEdit?: () => void;
}) => {
  const { budget, category } = line;
  if (!budget) {
    return null;
  }
  const overspent = line.status === "overspent";
  return (
    <ListItem
      className="items-start"
      interactive={onEdit !== undefined}
      onClick={onEdit}
    >
      <ListItemLeading>
        <IconTile size="sm" tint={category.color}>
          {category.icon}
        </IconTile>
      </ListItemLeading>
      <ListItemContent>
        <ListItemTitle>
          {category.name}
          {category.archivedAt ? (
            <Badge variant="outline">Archived</Badge>
          ) : null}
          {overspent ? <Badge variant="error">Over budget</Badge> : null}
        </ListItemTitle>
        <ListItemDescription>
          <Amount currency={line.currencyCode} value={line.spent} /> of{" "}
          <Amount currency={budget.currencyCode} value={budget.amount} />
        </ListItemDescription>
        <Meter
          aria-label={`${category.name} budget used`}
          className="mt-1.5"
          max={100}
          value={Math.min(line.percentUsed ?? 0, 100)}
        >
          <MeterTrack>
            <MeterIndicator tone={meterTone(line)} />
          </MeterTrack>
        </Meter>
        <OtherCurrencies line={line} />
      </ListItemContent>
      <ListItemTrailing>
        <div className="flex flex-col items-end gap-0.5">
          {overspent ? (
            <>
              <Amount
                currency={budget.currencyCode}
                tone="negative"
                value={line.overBy ?? "0"}
                weight="semibold"
              />
              <span className="text-destructive-foreground text-xs">over</span>
            </>
          ) : (
            <>
              <Amount
                currency={budget.currencyCode}
                value={line.remaining ?? "0"}
                weight="semibold"
              />
              <span className="text-muted-foreground text-xs">left</span>
            </>
          )}
        </div>
      </ListItemTrailing>
    </ListItem>
  );
};

const UnbudgetedRow = ({
  line,
  onEdit,
}: {
  line: BudgetLine;
  onEdit?: () => void;
}) => (
  <ListItem>
    <ListItemLeading>
      <IconTile size="sm" tint={line.category.color}>
        {line.category.icon}
      </IconTile>
    </ListItemLeading>
    <ListItemContent>
      <ListItemTitle>
        {line.category.name}
        {line.category.archivedAt ? (
          <Badge variant="outline">Archived</Badge>
        ) : null}
      </ListItemTitle>
      <ListItemDescription>
        {toNumber(line.spent) > 0 ? (
          <>
            <Amount currency={line.currencyCode} value={line.spent} /> spent
          </>
        ) : (
          "No spending"
        )}
      </ListItemDescription>
      <OtherCurrencies line={line} />
    </ListItemContent>
    {onEdit ? (
      <ListItemTrailing>
        <Button
          aria-label={`Set ${line.category.name} budget`}
          onClick={onEdit}
          size="sm"
          variant="secondary"
        >
          Set budget
        </Button>
      </ListItemTrailing>
    ) : null}
  </ListItem>
);

const Summary = ({ data }: { data: MonthBudgets }) => {
  const { totals } = data;
  const over = toNumber(totals.overBy) > 0;
  return (
    <StatGroup aria-label="Month summary">
      <Stat>
        <StatLabel>Budgeted</StatLabel>
        <StatValue>
          <Amount currency={totals.currencyCode} value={totals.budgeted} />
        </StatValue>
        <StatDetail>
          {`${totals.budgetedCount} ${totals.budgetedCount === 1 ? "category" : "categories"}`}
        </StatDetail>
      </Stat>
      <Stat>
        <StatLabel>Spent</StatLabel>
        <StatValue>
          <Amount currency={totals.currencyCode} value={totals.spent} />
        </StatValue>
        <StatDetail>In budgeted categories</StatDetail>
      </Stat>
      <Stat>
        <StatLabel>{over ? "Over budget" : "Left"}</StatLabel>
        <StatValue>
          <Amount
            currency={totals.currencyCode}
            tone={over ? "negative" : "default"}
            value={over ? totals.overBy : totals.remaining}
          />
        </StatValue>
        <StatDetail>
          {totals.overspentCount > 0
            ? `${totals.overspentCount} over budget`
            : "None over budget"}
        </StatDetail>
      </Stat>
      <Stat>
        <StatLabel>Not budgeted</StatLabel>
        <StatValue>
          <Amount
            currency={totals.currencyCode}
            value={totals.unbudgetedSpent}
          />
        </StatValue>
        <StatDetail>Spent elsewhere</StatDetail>
      </Stat>
    </StatGroup>
  );
};

const countedThrough = (data: MonthBudgets): string => {
  if (data.dateTo === null) {
    return "This month hasn’t started, so nothing is spent yet.";
  }
  if (data.month === data.currentMonth) {
    return `Spending counted through today, ${formatLongDate(data.dateTo)}.`;
  }
  return "Spending from the whole month.";
};

/**
 * Monthly category budgets against what the ledger says was spent. The
 * server does every sum; this screen only lays the numbers out.
 */
// One screen for the month switcher, both lists and the editor.
// oxlint-disable-next-line complexity
export const BudgetsPage = ({
  activeOrganizationId,
  month,
  onMonthChange,
  permissions,
}: {
  activeOrganizationId: string;
  /** `YYYY-MM`; undefined is the household's current month. */
  month: string | undefined;
  /** No month returns to the household's current one. */
  onMonthChange: (month?: string) => void;
  permissions: BudgetPermissions;
}) => {
  const budgets = useQuery(
    householdOrpc(activeOrganizationId).budgets.month.queryOptions({
      input: { month },
      meta: { suppressErrorToast: true },
      placeholderData: keepPreviousData,
    })
  );
  const [editing, setEditing] = useState<{
    categoryId: string;
    key: number;
    open: boolean;
  } | null>(null);

  const shown = month ?? budgets.data?.currentMonth;
  const currentMonth = budgets.data?.currentMonth;
  const goTo = (target: string) =>
    target === currentMonth ? onMonthChange() : onMonthChange(target);

  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>Budgets</PageTitle>
        <PageDescription>
          Monthly limits for expense categories, measured against the ledger.
        </PageDescription>
      </PageHeading>
      {shown ? (
        <PageActions>
          <Button
            aria-label="Previous month"
            onClick={() => goTo(shiftMonth(shown, -1))}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <span
            aria-live="polite"
            className="min-w-32 text-center text-sm font-medium"
          >
            {formatMonthYear(shown)}
          </span>
          <Button
            aria-label="Next month"
            onClick={() => goTo(shiftMonth(shown, 1))}
            size="icon"
            variant="ghost"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
          {month !== undefined && month !== currentMonth ? (
            <Button
              onClick={() => onMonthChange()}
              size="sm"
              variant="secondary"
            >
              This month
            </Button>
          ) : null}
        </PageActions>
      ) : null}
    </PageHeader>
  );

  if (budgets.isPending) {
    return (
      <Page aria-busy="true" width="narrow">
        {header}
        <Skeleton className="h-20 w-full" radius="2xl" />
        <Skeleton className="h-64 w-full" radius="2xl" />
      </Page>
    );
  }
  if (budgets.isError) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyTitle>Couldn’t load budgets</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
          <EmptyContent>
            <Button onClick={() => budgets.refetch()} variant="secondary">
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const { data } = budgets;
  const budgeted = data.lines.filter((line) => line.budget !== null);
  const unbudgeted = data.lines.filter((line) => line.budget === null);
  const editable = (line: BudgetLine) =>
    permissions.canUpdate && line.category.archivedAt === null;
  const openEditor = (line: BudgetLine) =>
    setEditing((current) => ({
      categoryId: line.category.id,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const editingLine = data.lines.find(
    (line) => line.category.id === editing?.categoryId
  );

  if (data.lines.length === 0) {
    return (
      <Page width="narrow">
        {header}
        <Empty>
          <EmptyMedia>
            <HugeiconsIcon icon={PieChart01Icon} strokeWidth={1.8} />
          </EmptyMedia>
          <EmptyTitle>No expense categories</EmptyTitle>
          <EmptyDescription>
            Budgets are set per expense category. Add one to get started.
          </EmptyDescription>
          <EmptyContent>
            <Button render={<Link to="/categories" />} variant="secondary">
              Manage categories
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  return (
    <Page aria-busy={budgets.isPlaceholderData || undefined} width="narrow">
      {header}
      {budgeted.length > 0 ? <Summary data={data} /> : null}
      <p className="text-muted-foreground px-1 text-xs">
        {`${countedThrough(data)} Transfers and income never count.`}
      </p>

      <Section>
        <SectionHeader>
          <SectionTitle>Budgeted</SectionTitle>
        </SectionHeader>
        {budgeted.length === 0 ? (
          <Empty size="compact">
            <EmptyTitle>{`No budgets for ${formatMonthYear(data.month)}`}</EmptyTitle>
            <EmptyDescription>
              {permissions.canUpdate
                ? "Set a budget on any category below to track it here."
                : "Nobody has set a budget for this month yet."}
            </EmptyDescription>
          </Empty>
        ) : (
          <List aria-label="Budgeted categories">
            {budgeted.map((line) => (
              <BudgetedRow
                key={line.category.id}
                line={line}
                onEdit={editable(line) ? () => openEditor(line) : undefined}
              />
            ))}
          </List>
        )}
      </Section>

      {unbudgeted.length > 0 ? (
        <Section>
          <SectionHeader>
            <SectionTitle>Not budgeted</SectionTitle>
          </SectionHeader>
          <SectionDescription>
            Spending still counts in reports; it just has no limit this month.
          </SectionDescription>
          <List aria-label="Categories without a budget">
            {unbudgeted.map((line) => (
              <UnbudgetedRow
                key={line.category.id}
                line={line}
                onEdit={editable(line) ? () => openEditor(line) : undefined}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {editing && editingLine ? (
        <BudgetEditor
          activeOrganizationId={activeOrganizationId}
          canClear={permissions.canClear}
          key={editing.key}
          line={editingLine}
          month={data.month}
          onOpenChange={(open) =>
            setEditing((current) => (current ? { ...current, open } : current))
          }
          open={editing.open}
        />
      ) : null}
    </Page>
  );
};
