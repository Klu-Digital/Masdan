import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Amount } from "@/components/finance/amount";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import {
  STATUS_LABELS,
  billSourceLabel,
  paidReason,
  statusBadgeVariant,
} from "../presentation";
import type { Bill, BillCandidate } from "../types";

const candidateTitle = (candidate: BillCandidate): string => {
  if (candidate.isPosting) {
    return "Posted by this schedule";
  }
  return candidate.categoryName ?? `Transfer to ${candidate.accountName}`;
};

/** Transactions that could be this bill's payment, with a link action each. */
const Candidates = ({
  activeOrganizationId,
  bill,
  linking,
  onLink,
  today,
}: {
  activeOrganizationId: string;
  bill: Bill;
  linking: string | null;
  onLink: (transactionId: string) => void;
  today: string;
}) => {
  const candidates = useQuery(
    householdOrpc(activeOrganizationId).bills.candidates.queryOptions({
      input: {
        dueDate: bill.dueDate,
        kind: bill.kind,
        sourceId: bill.sourceId,
      },
    })
  );
  if (candidates.isPending) {
    return <Skeleton className="h-16 w-full" radius="2xl" />;
  }
  if (candidates.isError || candidates.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {bill.kind === "card"
          ? "No unlinked transfers into this card within a month of the due date."
          : "No unlinked paid expenses on this account or category within a month of the due date."}
      </p>
    );
  }
  return (
    <List aria-label="Possible payments">
      {candidates.data.map((candidate) => (
        <ListItem key={candidate.id}>
          <ListItemContent>
            <ListItemTitle>{candidateTitle(candidate)}</ListItemTitle>
            <ListItemDescription>
              {`${formatShortDate(candidate.transactionDate, today)} · ${candidate.accountName}`}
              {candidate.notes ? ` · ${candidate.notes}` : ""}
            </ListItemDescription>
          </ListItemContent>
          <ListItemTrailing>
            <div className="flex items-center gap-2">
              <Amount
                currency={candidate.currencyCode}
                value={candidate.amount}
                weight="semibold"
              />
              <Button
                aria-label={`Link payment from ${formatShortDate(candidate.transactionDate, today)}`}
                disabled={linking !== null}
                loading={linking === candidate.id}
                onClick={() => onLink(candidate.id)}
                size="sm"
                variant="secondary"
              >
                Link
              </Button>
            </div>
          </ListItemTrailing>
        </ListItem>
      ))}
    </List>
  );
};

/** Card bills may also be settled with an explicit payment link. */
const ConfirmSection = ({
  activeOrganizationId,
  bill,
  today,
}: {
  activeOrganizationId: string;
  bill: Bill;
  today: string;
}) => {
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: (transactionId: string | null) =>
      householdOrpc(activeOrganizationId).bills.confirm.call({
        dueDate: bill.dueDate,
        kind: bill.kind,
        sourceId: bill.sourceId,
        transactionId,
      }),
    onSuccess: async () => {
      await invalidate(queryClient, activeOrganizationId, "ledger");
      toastManager.add({ title: `${bill.name} marked paid`, type: "success" });
    },
  });
  const linking = confirm.isPending
    ? (confirm.variables ?? "confirming")
    : null;
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Link the payment</h3>
        <p className="text-muted-foreground text-xs">
          Transfers into the card after the statement closed count
          automatically.
        </p>
        <Candidates
          activeOrganizationId={activeOrganizationId}
          bill={bill}
          linking={linking}
          onLink={(transactionId) => confirm.mutate(transactionId)}
          today={today}
        />
      </section>
      <Button
        disabled={confirm.isPending}
        loading={linking === "confirming"}
        onClick={() => confirm.mutate(null)}
        variant="secondary"
      >
        Mark paid without a payment
      </Button>
    </>
  );
};

const CardPaid = ({ bill }: { bill: Bill }) =>
  bill.kind === "card" && bill.paidAmount !== null ? (
    <p className="text-muted-foreground text-sm">
      <Amount currency={bill.currencyCode} value={bill.paidAmount} /> paid into
      the card for this cycle
      {bill.minimumAmountDue ? (
        <>
          {" · minimum "}
          <Amount currency={bill.currencyCode} value={bill.minimumAmountDue} />
        </>
      ) : null}
    </p>
  ) : null;

export const BillSheet = ({
  activeOrganizationId,
  bill,
  canConfirm,
  onOpenChange,
  open,
  today,
}: {
  activeOrganizationId: string;
  bill: Bill;
  canConfirm: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  today: string;
}) => {
  const queryClient = useQueryClient();
  const unconfirm = useMutation({
    mutationFn: (paymentId: string) =>
      householdOrpc(activeOrganizationId).bills.unconfirm.call({ paymentId }),
    onSuccess: async () => {
      await invalidate(queryClient, activeOrganizationId, "ledger");
      toastManager.add({
        title: `${bill.name} marked unpaid`,
        type: "success",
      });
    },
  });

  const reason = paidReason(bill);
  const { payment } = bill;
  // A linked payment that was archived or marked unpaid no longer counts.
  const stale = payment !== null && reason === null;

  return (
    <ResponsiveSheet
      description={`Due ${formatLongDate(bill.dueDate)}`}
      onOpenChange={onOpenChange}
      open={open}
      title={bill.name}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col items-start gap-1">
            <Badge variant={statusBadgeVariant(bill.status)}>
              {bill.kind === "recurring" && bill.status === "paid"
                ? "Posted"
                : STATUS_LABELS[bill.status]}
            </Badge>
            <p className="text-muted-foreground text-sm">
              {`${billSourceLabel(bill)} · ${bill.account.name}`}
            </p>
            {reason ? <p className="text-sm">{reason}</p> : null}
            {stale ? (
              <p className="text-warning-foreground text-sm">
                The linked payment was archived or marked unpaid, so it no
                longer counts.
              </p>
            ) : null}
          </div>
          {bill.amount === null ? (
            <span className="text-muted-foreground text-sm">No amount yet</span>
          ) : (
            <Amount
              currency={bill.currencyCode}
              size="lg"
              value={bill.amount}
              weight="semibold"
            />
          )}
        </div>

        <CardPaid bill={bill} />

        {bill.kind === "recurring" ? (
          <p className="text-muted-foreground text-sm">
            Income and expenses are posted automatically on their scheduled
            date. No payment confirmation is needed.
          </p>
        ) : null}
        {bill.postedTransactionId ? (
          <Button
            render={
              <Link
                params={{ transactionId: bill.postedTransactionId }}
                to="/transactions/$transactionId"
              />
            }
            variant="secondary"
          >
            View transaction
          </Button>
        ) : null}

        {payment?.transaction ? (
          <Button
            render={
              <Link
                params={{ transactionId: payment.transaction.id }}
                to="/transactions/$transactionId"
              />
            }
            variant="secondary"
          >
            View linked payment
          </Button>
        ) : null}

        {bill.kind === "card" && canConfirm && payment ? (
          <Button
            loading={unconfirm.isPending}
            onClick={() => unconfirm.mutate(payment.id)}
            variant="destructive-outline"
          >
            {payment.transaction ? "Unlink payment" : "Mark unpaid"}
          </Button>
        ) : null}

        {bill.kind === "card" &&
        canConfirm &&
        !payment &&
        bill.status !== "paid" ? (
          <ConfirmSection
            activeOrganizationId={activeOrganizationId}
            bill={bill}
            today={today}
          />
        ) : null}
      </div>
    </ResponsiveSheet>
  );
};
