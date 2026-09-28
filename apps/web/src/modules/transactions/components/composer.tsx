import { Button } from "@masdan/ui/components/button";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { useState } from "react";

import type { TransactionDetail } from "../queries";
import { TransactionForm } from "./transaction-form";
import type {
  TransactionKindChoice,
  TransactionPrefill,
} from "./transaction-form";
import { TransferForm } from "./transfer-form";
import type { AmountSuggestion, Transfer } from "./transfer-form";

export type ComposerKind = TransactionKindChoice | "transfer";

export type ComposerRequest =
  | {
      accountId?: string;
      kind?: TransactionKindChoice;
      onSaved?: (transactionId: string) => void;
      /** From quick entry: what it resolved, and the text it came from. */
      prefill?: TransactionPrefill & { source: string };
      transaction?: TransactionDetail;
      type: "transaction";
    }
  | {
      destinationAccountId?: string;
      /** Paying a card: title, asset-only sources and quick amounts. */
      payCard?: { name: string; suggestions: AmountSuggestion[] };
      sourceAccountId?: string;
      transfer?: Transfer;
      type: "transfer";
    };

const initialKind = (request: ComposerRequest): ComposerKind => {
  if (request.type === "transfer") {
    return "transfer";
  }
  if (request.transaction) {
    return request.transaction.type === "income" ? "income" : "expense";
  }
  return request.kind ?? "expense";
};

/** Paying a card explains itself; quick entry shows the text it came from. */
const sheetDescription = (request: ComposerRequest): string | undefined => {
  if (request.type === "transfer") {
    return request.payCard
      ? "Moves money from one of your accounts to the card. It isn’t counted as spending."
      : undefined;
  }
  return request.prefill ? `From “${request.prefill.source}”` : undefined;
};

const TITLES: Record<ComposerKind, string> = {
  expense: "New expense",
  income: "New income",
  transfer: "New transfer",
};

const SUBMIT: Record<ComposerKind, string> = {
  expense: "Add expense",
  income: "Add income",
  transfer: "Record transfer",
};

/**
 * One composer for every ledger entry. Creating lets you switch between
 * expense, income and transfer without losing your place; editing keeps the
 * kind fixed except for the expense ↔ income flip the API allows.
 */
export const Composer = ({
  activeOrganizationId,
  householdCurrency,
  onOpenChange,
  open,
  request,
  timezone,
}: {
  activeOrganizationId: string;
  householdCurrency: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  request: ComposerRequest;
  timezone: string;
}) => {
  const [kind, setKind] = useState<ComposerKind>(() => initialKind(request));
  const editingTransaction =
    request.type === "transaction" ? request.transaction : undefined;
  const editingTransfer =
    request.type === "transfer" ? request.transfer : undefined;
  const editing = Boolean(editingTransaction ?? editingTransfer);
  const payCard = request.type === "transfer" ? request.payCard : undefined;
  const transactionRequest =
    request.type === "transaction" ? request : undefined;

  let title = TITLES[kind];
  if (payCard) {
    title = `Pay ${payCard.name}`;
  } else if (editingTransfer) {
    title = "Edit transfer";
  } else if (editingTransaction) {
    title = "Edit transaction";
  }

  let submitLabel = SUBMIT[kind];
  if (editing) {
    submitLabel = "Save";
  } else if (payCard) {
    submitLabel = "Record payment";
  }

  const close = () => onOpenChange(false);
  const actions = ({
    canSubmit,
    isSubmitting,
  }: {
    canSubmit: boolean;
    isSubmitting: boolean;
  }) => (
    <>
      <Button onClick={close} variant="secondary">
        Cancel
      </Button>
      <Button disabled={!canSubmit} loading={isSubmitting} type="submit">
        {submitLabel}
      </Button>
    </>
  );

  const showKindSwitch = !(payCard || editingTransfer);
  const kinds: ComposerKind[] = editingTransaction
    ? ["expense", "income"]
    : ["expense", "income", "transfer"];

  return (
    <ResponsiveSheet
      description={sheetDescription(request)}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      <div className="flex flex-col gap-4">
        {showKindSwitch ? (
          <Tabs
            onValueChange={(value) => setKind(value as ComposerKind)}
            value={kind}
          >
            <TabsList aria-label="Entry type" className="w-full">
              {kinds.map((option) => (
                <TabsTab key={option} value={option}>
                  {option === "expense" ? "Expense" : null}
                  {option === "income" ? "Income" : null}
                  {option === "transfer" ? "Transfer" : null}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
        {kind === "transfer" ? (
          <TransferForm
            actions={actions}
            activeOrganizationId={activeOrganizationId}
            destinationAccountId={
              request.type === "transfer"
                ? request.destinationAccountId
                : undefined
            }
            lockDestination={Boolean(payCard)}
            onSaved={close}
            sourceAccountId={
              request.type === "transfer"
                ? request.sourceAccountId
                : request.accountId
            }
            suggestions={payCard?.suggestions}
            timezone={timezone}
            transfer={editingTransfer}
          />
        ) : (
          <TransactionForm
            actions={actions}
            activeOrganizationId={activeOrganizationId}
            defaultAccountId={
              request.type === "transaction" ? request.accountId : undefined
            }
            householdCurrency={householdCurrency}
            kind={kind}
            onSaved={(transactionId) => {
              close();
              transactionRequest?.onSaved?.(transactionId);
            }}
            prefill={transactionRequest?.prefill}
            timezone={timezone}
            transaction={editingTransaction}
          />
        )}
      </div>
    </ResponsiveSheet>
  );
};
