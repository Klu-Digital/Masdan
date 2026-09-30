import {
  ArrowRight01Icon,
  BalanceScaleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  fixedAmountText,
  signedAmount,
  signedScaledAmount,
} from "@masdan/api/shared/money";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldLabel } from "@masdan/ui/components/field";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DatePicker } from "@/components/date-picker";
import { Amount } from "@/components/finance/amount";
import { AmountInput } from "@/components/finance/amount-input";
import { moneyParts } from "@/components/finance/money";
import { useHousehold } from "@/hooks/use-household";
import { formatLongDate } from "@/lib/dates";
import { invalidate } from "@/utils/invalidate";
import { errorMessage, householdOrpc } from "@/utils/orpc";

// oxlint-disable-next-line complexity
export const ReconciliationComposer = ({
  account,
  today,
  onOpenChange,
}: {
  account: {
    id: string;
    name: string;
    accountClass?: "asset" | "liability";
    currencyCode: string;
    balance: string;
    openingBalanceDate: string;
  };
  today: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const { activeOrganizationId } = useHousehold();
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [notes, setNotes] = useState("");
  const orpc = householdOrpc(activeOrganizationId);
  const validDate = effectiveDate >= account.openingBalanceDate;
  const preview = useQuery(
    orpc.accounts.previewReconciliation.queryOptions({
      enabled: validDate,
      input: { accountId: account.id, effectiveDate },
      meta: { suppressErrorToast: true },
    })
  );
  const reconcile = useMutation(
    orpc.accounts.reconcile.mutationOptions({
      meta: { suppressErrorToast: true },
      onSuccess: async () => {
        await invalidate(queryClient, activeOrganizationId, "ledger");
        onOpenChange(false);
        toastManager.add({ title: "Balance reconciled", type: "success" });
      },
    })
  );
  const validBalance = signedAmount.safeParse(balance).success;
  const calculated = preview.data?.calculatedBalance;
  const ready =
    validDate &&
    !preview.isFetching &&
    !preview.isError &&
    calculated !== undefined;
  const delta =
    ready && validBalance
      ? signedScaledAmount(balance) - signedScaledAmount(calculated)
      : null;
  const canConfirm = delta !== null && !reconcile.isPending;
  const matching = delta === 0n;

  return (
    <ResponsiveSheet
      open
      onOpenChange={onOpenChange}
      title={`Reconcile ${account.name}`}
      description="Match Masdan to your bank, wallet, or statement balance."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={reconcile.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            form="reconciliationForm"
            type="submit"
            disabled={!canConfirm}
            loading={reconcile.isPending}
          >
            Confirm reconciliation
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        id="reconciliationForm"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canConfirm || calculated === undefined) {
            return;
          }
          await reconcile
            .mutateAsync({
              accountId: account.id,
              balance,
              effectiveDate,
              expectedBalance: calculated,
              notes: notes || null,
            })
            .catch(async () => {
              await preview.refetch();
            });
        }}
      >
        <fieldset
          className="flex min-w-0 flex-col gap-5"
          disabled={reconcile.isPending}
        >
          <div className="bg-card rounded-2xl px-3 py-4">
            <Field className="items-stretch" name="actualBalance">
              <div className="flex items-center justify-between px-2">
                <FieldLabel htmlFor="actualBalance">Actual balance</FieldLabel>
                <span className="text-muted-foreground text-xs font-medium">
                  {account.currencyCode}
                </span>
              </div>
              <AmountInput
                id="actualBalance"
                currencySymbol={moneyParts(0, account.currencyCode).currency}
                value={balance}
                onValueChange={(value) => {
                  setBalance(value);
                  reconcile.reset();
                }}
                invalid={balance !== "" && !validBalance}
                aria-describedby="actualBalanceHint"
              />
              <p
                className="text-muted-foreground px-2 text-center text-xs"
                id="actualBalanceHint"
              >
                {account.accountClass === "liability"
                  ? "Enter the amount owed, or a negative balance if you’re in credit."
                  : "Enter the balance shown in your bank app or statement."}
              </p>
              {balance !== "" && !validBalance ? (
                <p className="text-destructive-foreground px-2 text-sm">
                  Enter a valid balance.
                </p>
              ) : null}
            </Field>
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-3 px-1 text-xs">
            <span>Current Masdan balance</span>
            <Amount
              currency={account.currencyCode}
              value={account.balance}
              weight="medium"
            />
          </div>
          <section
            aria-label="Balance adjustment"
            className="bg-card flex flex-col gap-4 rounded-2xl p-5"
            aria-live="polite"
            aria-busy={preview.isFetching}
          >
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                aria-hidden="true"
                className="text-brand-text size-4"
                icon={BalanceScaleIcon}
                strokeWidth={1.8}
              />
              <h3 className="text-sm font-semibold">Balance adjustment</h3>
            </div>
            {validDate && preview.isError ? (
              <div role="alert" className="text-sm">
                Could not calculate the balance.{" "}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => preview.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {validDate && preview.isFetching ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : null}
            {ready ? (
              <>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <dt className="text-muted-foreground text-xs">
                      Masdan on {formatLongDate(effectiveDate)}
                    </dt>
                    <dd>
                      <Amount
                        currency={account.currencyCode}
                        value={calculated}
                        size="title"
                      />
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="size-3"
                        icon={ArrowRight01Icon}
                        strokeWidth={1.8}
                      />{" "}
                      Your actual balance
                    </dt>
                    <dd>
                      {validBalance ? (
                        <Amount
                          currency={account.currencyCode}
                          value={balance}
                          size="title"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Enter a balance above
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                <fieldset
                  className="border-hairline flex min-w-0 flex-col gap-2 border-t pt-4"
                  aria-label="Adjustment amount"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {matching ? "No adjustment needed" : "Adjustment to add"}
                    </span>
                    {delta === null ? (
                      <span className="text-muted-foreground text-sm">
                        Not calculated yet
                      </span>
                    ) : (
                      <Amount
                        currency={account.currencyCode}
                        value={fixedAmountText(delta)}
                        sign={delta > 0n ? "in" : "auto"}
                        size="title"
                      />
                    )}
                  </div>
                  {delta === null ? null : (
                    <p className="text-muted-foreground text-xs">
                      {matching
                        ? "Balances match. Only a balance checkpoint will be saved."
                        : "This changes the account balance, not your income or spending."}
                    </p>
                  )}
                </fieldset>
              </>
            ) : null}
            {validDate ? null : (
              <p className="text-muted-foreground text-sm">
                Choose a valid effective date to preview the adjustment.
              </p>
            )}
          </section>
          <Field name="effectiveDate">
            <FieldLabel htmlFor="effectiveDate">Effective date</FieldLabel>
            <DatePicker
              id="effectiveDate"
              value={effectiveDate}
              onValueChange={(value) => {
                setEffectiveDate(value);
                reconcile.reset();
              }}
              aria-invalid={!validDate || undefined}
            />
            {validDate ? null : (
              <p className="text-destructive-foreground text-sm">
                Choose a date on or after {account.openingBalanceDate}.
              </p>
            )}
          </Field>
          <Field name="reconciliationNote">
            <FieldLabel htmlFor="reconciliationNote">
              Note or reason (optional)
            </FieldLabel>
            <Textarea
              id="reconciliationNote"
              rows={2}
              maxLength={2000}
              placeholder="For example, checked against my bank statement"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </fieldset>

        {reconcile.isError ? (
          <p role="alert" className="text-destructive-foreground text-sm">
            {errorMessage(reconcile.error)}
          </p>
        ) : null}
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <HugeiconsIcon
            aria-hidden="true"
            className="size-4 shrink-0"
            icon={CheckmarkCircle02Icon}
            strokeWidth={1.8}
          />
          Old transactions stay untouched. You can archive the adjustment later
          to undo it.
        </p>
      </form>
    </ResponsiveSheet>
  );
};
