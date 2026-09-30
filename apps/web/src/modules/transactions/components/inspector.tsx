import {
  Archive02Icon,
  ArchiveRestoreIcon,
  Delete02Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { ColorDot, IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import { ResponsiveSheet } from "@masdan/ui/components/responsive-sheet";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { Amount } from "@/components/finance/amount";
import { formatLongDate } from "@/lib/dates";
import { TransactionRule } from "@/modules/rules/components/transaction-rule";
import { TransactionSuggestion } from "@/modules/suggestions/components/transaction-suggestion";
import { householdOrpc } from "@/utils/orpc";

import { describeTransaction } from "../presentation";
import type { TransactionDetail } from "../types";
import type { LedgerActions } from "../use-ledger-actions";
import { DeleteTransferDialog } from "./delete-transfer-dialog";
import { TransactionAttachments } from "./transaction-attachments";
import type { LedgerPermissions } from "./transaction-menu";
import { TransactionTile } from "./transaction-tile";

const Row = ({ children, label }: { children: ReactNode; label: string }) => (
  <ListItem className="min-h-11">
    <ListItemContent className="flex-none">
      <span className="text-muted-foreground text-sm">{label}</span>
    </ListItemContent>
    <ListItemTrailing className="min-w-0 flex-1 shrink justify-end">
      {children}
    </ListItemTrailing>
  </ListItem>
);

const TransferDetails = ({ detail }: { detail: TransactionDetail }) => {
  const { transfer } = detail;
  if (!transfer) {
    return null;
  }
  return (
    <List>
      <ListItem
        render={
          <Link
            params={{ accountId: transfer.sourceAccountId }}
            to="/accounts/$accountId"
          />
        }
      >
        <ListItemContent>
          <span className="text-muted-foreground text-xs">From</span>
          <ListItemTitle>{transfer.sourceAccount.name}</ListItemTitle>
        </ListItemContent>
        <ListItemTrailing chevron>
          <Amount
            currency={transfer.sourceAccount.currencyCode}
            sign="out"
            value={transfer.sourceAmount}
          />
        </ListItemTrailing>
      </ListItem>
      <ListItem
        render={
          <Link
            params={{ accountId: transfer.destinationAccountId }}
            to="/accounts/$accountId"
          />
        }
      >
        <ListItemContent>
          <span className="text-muted-foreground text-xs">To</span>
          <ListItemTitle>{transfer.destinationAccount.name}</ListItemTitle>
        </ListItemContent>
        <ListItemTrailing chevron>
          <Amount
            currency={transfer.destinationAccount.currencyCode}
            sign="in"
            tone="positive"
            value={transfer.destinationAmount}
          />
        </ListItemTrailing>
      </ListItem>
    </List>
  );
};

const EntryDetails = ({ detail }: { detail: TransactionDetail }) => (
  <List>
    {detail.reconciliationSnapshotId ? (
      <Row label="Posting">
        Balance adjustment · excluded from income and expenses
      </Row>
    ) : (
      <Row label="Category">
        <span className="flex min-w-0 items-center gap-2">
          <IconTile tint={detail.categoryColor} size="xs">
            {detail.categoryIcon}
          </IconTile>
          <span className="truncate">{detail.categoryName}</span>
        </span>
      </Row>
    )}
    {detail.accountId ? (
      <ListItem
        className="min-h-11"
        render={
          <Link
            params={{ accountId: detail.accountId }}
            to="/accounts/$accountId"
          />
        }
      >
        <ListItemContent>
          <span className="text-muted-foreground text-sm">Account</span>
        </ListItemContent>
        <ListItemTrailing chevron>{detail.accountName}</ListItemTrailing>
      </ListItem>
    ) : (
      <Row label="Account">No account</Row>
    )}
    <Row label="Status">
      {detail.paidStatus === "paid" ? (
        "Paid"
      ) : (
        <Badge size="lg" variant="warning">
          Unpaid
        </Badge>
      )}
    </Row>
    {detail.recurringScheduleId && detail.recurringOccurrenceDate ? (
      <ListItem className="min-h-11" render={<Link to="/recurring" />}>
        <ListItemContent className="flex-none">
          <span className="text-muted-foreground text-sm">Posted by</span>
        </ListItemContent>
        <ListItemTrailing chevron className="min-w-0 flex-1 shrink justify-end">
          <span className="truncate">
            {`${detail.recurringScheduleName ?? "Recurring schedule"} · ${formatLongDate(detail.recurringOccurrenceDate)}`}
          </span>
        </ListItemTrailing>
      </ListItem>
    ) : null}
    {detail.tags.length > 0 ? (
      <Row label="Tags">
        <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          {detail.tags.map((tag) => (
            <span className="inline-flex items-center gap-1.5" key={tag.id}>
              <ColorDot tint={tag.color} />
              {tag.name}
            </span>
          ))}
        </span>
      </Row>
    ) : null}
  </List>
);

const SplitDetails = ({ detail }: { detail: TransactionDetail }) => {
  if (detail.splits.length === 0) {
    return null;
  }
  const sign = detail.type === "income" ? "in" : "out";
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-4 text-xs font-medium">
        Split across {detail.splits.length} categories
      </h3>
      <List>
        {detail.splits.map((split) => (
          <ListItem className="min-h-12" key={split.id}>
            <ListItemLeading>
              <IconTile tint={split.categoryColor} size="sm">
                {split.categoryIcon}
              </IconTile>
            </ListItemLeading>
            <ListItemContent>
              <ListItemTitle>{split.categoryName}</ListItemTitle>
            </ListItemContent>
            <ListItemTrailing>
              <Amount
                currency={detail.currencyCode}
                sign={sign}
                value={split.amount}
              />
            </ListItemTrailing>
          </ListItem>
        ))}
      </List>
    </section>
  );
};

/**
 * Everything about one ledger entry, beside the page it was opened from.
 * Transfers show both legs; entries show allocation, tags and the full note.
 */
// One surface for transfers and entries, each with permission-gated actions.
// oxlint-disable-next-line complexity
export const TransactionInspector = ({
  actions,
  activeOrganizationId,
  onEdit,
  onOpenChange,
  open,
  permissions,
  transactionId,
}: {
  actions: LedgerActions;
  activeOrganizationId: string | null;
  onEdit: (detail: TransactionDetail) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  permissions: LedgerPermissions;
  transactionId: string;
}) => {
  const query = useQuery(
    householdOrpc(activeOrganizationId).transactions.get.queryOptions({
      input: { transactionId },
    })
  );
  const [confirming, setConfirming] = useState(false);
  const detail = query.data;
  const view = detail ? describeTransaction(detail) : null;

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="size-12" radius="2xl" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-40 w-full" radius="2xl" />
      </div>
    );
  } else if (detail && view) {
    const archived = detail.archivedAt !== null;
    const { transfer } = detail;
    const canEdit =
      permissions.canUpdate &&
      !detail.reconciliationSnapshotId &&
      (transfer !== null || !archived);
    body = (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 pt-1 text-center">
          <TransactionTile size="lg" transaction={detail} />
          <p className="text-muted-foreground mt-1 text-sm">{view.title}</p>
          <Amount
            currency={detail.currencyCode}
            sign={transfer ? "none" : view.sign}
            size="display"
            tone={archived ? "muted" : "auto"}
            value={transfer ? transfer.sourceAmount : detail.amount}
          />
          <p className="text-muted-foreground text-xs">
            {formatLongDate(detail.transactionDate)}
          </p>
          {archived ? (
            <Badge size="lg" variant="outline">
              Archived — not counted in balances
            </Badge>
          ) : null}
        </div>

        {transfer ? (
          <TransferDetails detail={detail} />
        ) : (
          <EntryDetails detail={detail} />
        )}
        <SplitDetails detail={detail} />

        {detail.notes ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground px-4 text-xs font-medium">
              Note
            </h3>
            <p className="bg-card dark:ring-hairline rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap dark:ring-1">
              {detail.notes}
            </p>
          </section>
        ) : null}

        {transfer || detail.reconciliationSnapshotId ? null : (
          <TransactionRule
            canApply={permissions.canUpdate}
            transaction={detail}
          />
        )}

        {transfer || detail.reconciliationSnapshotId ? null : (
          <TransactionSuggestion
            canAccept={permissions.canUpdate}
            transaction={detail}
          />
        )}

        {transfer ? null : (
          <TransactionAttachments
            editable={!archived}
            transactionId={detail.id}
          />
        )}

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              className="flex-1"
              onClick={() => onEdit(detail)}
              variant="secondary"
            >
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} />
              Edit
            </Button>
          ) : null}
          {!transfer && !archived && permissions.canArchive ? (
            <Button
              className="flex-1"
              loading={actions.archive.isPending}
              onClick={() => actions.archive.mutate(detail.id)}
              variant="secondary"
            >
              <HugeiconsIcon icon={Archive02Icon} strokeWidth={1.8} />
              Archive
            </Button>
          ) : null}
          {!transfer && archived && permissions.canRestore ? (
            <Button
              className="flex-1"
              loading={actions.restore.isPending}
              onClick={() => actions.restore.mutate(detail.id)}
              variant="secondary"
            >
              <HugeiconsIcon icon={ArchiveRestoreIcon} strokeWidth={1.8} />
              Restore
            </Button>
          ) : null}
          {transfer && permissions.canArchive ? (
            <Button
              className="flex-1"
              onClick={() => setConfirming(true)}
              variant="destructive-outline"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              Delete
            </Button>
          ) : null}
        </div>
        {transfer ? (
          <DeleteTransferDialog
            destination={transfer.destinationAccount.name}
            loading={actions.deleteTransfer.isPending}
            onConfirm={() =>
              actions.deleteTransfer.mutate(transfer.id, {
                onSuccess: () => {
                  setConfirming(false);
                  onOpenChange(false);
                },
              })
            }
            onOpenChange={setConfirming}
            open={confirming}
            source={transfer.sourceAccount.name}
          />
        ) : null}
      </div>
    );
  } else {
    body = (
      <p className="text-muted-foreground py-10 text-center">
        This transaction couldn’t be loaded. It may have been deleted.
      </p>
    );
  }

  let title = "Transaction";
  if (detail?.transfer) {
    title = "Transfer";
  } else if (detail?.reconciliationSnapshotId) {
    title = "Balance reconciliation";
  } else if (detail) {
    title = detail.type === "income" ? "Income" : "Expense";
  }

  return (
    <ResponsiveSheet
      desktop="sheet"
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      {body}
    </ResponsiveSheet>
  );
};
