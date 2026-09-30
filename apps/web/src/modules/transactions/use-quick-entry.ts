import { toastManager } from "@masdan/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import { invalidate } from "@/utils/invalidate";
import { errorMessage, householdOrpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

import type { ComposerRequest } from "./components/composer";
import type { ReviewField } from "./components/transaction-form";
import type { TransactionDetail } from "./types";

type QuickEntryParse = RouterOutputs["transactions"]["parseQuickEntry"];

/** Matches the API's limit, so an overlong line never costs a round trip. */
export const QUICK_ENTRY_MAX_LENGTH = 300;

// The form has no type field to flag, and the type decides the category.
const reviewField = (field: QuickEntryParse["issues"][number]["field"]) =>
  (field === "kind" ? "categoryId" : field) satisfies ReviewField;

/** What a parse resolved, as the composer request that lets you finish it. */
const quickEntryRequest = (
  parsed: QuickEntryParse,
  source: string
): Extract<ComposerRequest, { type: "transaction" }> => ({
  kind: parsed.kind,
  prefill: {
    issues: parsed.issues.map((issue) => ({
      field: reviewField(issue.field),
      message: issue.message,
    })),
    source,
    values: {
      accountId: parsed.prefill.accountId ?? undefined,
      amount: parsed.prefill.amount ?? undefined,
      categoryId: parsed.prefill.categoryId ?? undefined,
      notes: parsed.prefill.notes ?? undefined,
      paidStatus: parsed.prefill.paidStatus,
      transactionDate: parsed.prefill.transactionDate,
    },
  },
  type: "transaction",
});

const summaryOf = (
  transaction: TransactionDetail,
  money: ReturnType<typeof useFormattedMoney>
): string =>
  [
    money(Number(transaction.amount), transaction.currencyCode),
    transaction.categoryName,
    transaction.accountName,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * One line of text in, one transaction out, from anywhere in the app. `add` is
 * the create intent: a complete, unambiguous line is created at once and
 * reported by a toast with Undo (or View, for roles that cannot archive);
 * anything else opens the normal form prefilled. `review`, for text that came
 * from a link, only ever opens the form: following a link never creates.
 */
export const useQuickEntry = ({
  activeOrganizationId,
  canArchive,
  compose,
}: {
  activeOrganizationId: string | null;
  canArchive: boolean;
  compose: (request: ComposerRequest) => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const money = useFormattedMoney();
  const orpc = householdOrpc(activeOrganizationId);

  const refresh = () => invalidate(queryClient, activeOrganizationId, "ledger");

  const undo = async (transactionId: string) => {
    try {
      await orpc.transactions.archive.call({ transactionId });
      await refresh();
      toastManager.add({ title: "Transaction removed", type: "success" });
    } catch (error) {
      toastManager.add({ title: errorMessage(error), type: "error" });
    }
  };

  const created = async (transaction: TransactionDetail) => {
    await refresh();
    toastManager.add({
      actionProps: canArchive
        ? { children: "Undo", onClick: () => undo(transaction.id) }
        : {
            children: "View",
            onClick: () =>
              navigate({
                params: { transactionId: transaction.id },
                search: (previous) => previous,
                to: "/transactions/$transactionId",
              }),
          },
      description: summaryOf(transaction, money),
      title: `${transaction.type === "income" ? "Income" : "Expense"} added`,
      type: "success",
    });
  };

  const run = async (text: string, review: boolean) => {
    const source = text.trim().slice(0, QUICK_ENTRY_MAX_LENGTH);
    if (!source) {
      return;
    }
    const pending = toastManager.add({
      timeout: 0,
      title: "Reading your entry…",
      type: "loading",
    });
    const parsed = await orpc.transactions.parseQuickEntry
      .call({ text: source })
      .catch(() => null);
    toastManager.close(pending);
    if (!parsed) {
      // Nothing was read, so nothing is lost: the text goes into a blank form.
      toastManager.add({
        actionProps: {
          children: "Open form",
          onClick: () =>
            compose({
              kind: "expense",
              prefill: { issues: [], source, values: { notes: source } },
              type: "transaction",
            }),
        },
        description: "Try again in a moment, or fill it in by hand.",
        title: "Couldn’t read that entry",
        type: "error",
      });
      return;
    }
    if (review || !parsed.input) {
      compose(quickEntryRequest(parsed, source));
      return;
    }
    let transaction: TransactionDetail;
    try {
      transaction = await orpc.transactions.create.call(parsed.input);
    } catch (error) {
      // Create's own validation said no: finish it in the form instead.
      toastManager.add({ title: errorMessage(error), type: "error" });
      compose(quickEntryRequest(parsed, source));
      return;
    }
    await created(transaction);
  };

  return {
    add: (text: string) => run(text, false),
    review: (text: string) => run(text, true),
  };
};
