import { AiMagicIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
import { Button } from "@masdan/ui/components/button";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useAppActions } from "@/components/app-actions";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import { invalidate } from "@/utils/invalidate";
import { errorMessage, householdOrpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

import type { TransactionDetail } from "../types";
import type { ReviewField } from "./transaction-form";

type QuickEntryParse = RouterOutputs["transactions"]["parseQuickEntry"];

/** Matches the API's limit, so an overlong line never costs a round trip. */
const MAX_LENGTH = 300;

// The form has no type field to flag, and the type decides the category.
const reviewField = (field: QuickEntryParse["issues"][number]["field"]) =>
  (field === "kind" ? "categoryId" : field) satisfies ReviewField;

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
 * One line of text in, one transaction out. Submitting is the create intent:
 * a complete, unambiguous line is created at once with Undo and View; anything
 * else opens the normal form prefilled. The text stays until a transaction
 * exists, so a line that needs review is never lost. `linkedText`, from a
 * link, is only ever read into the form: following a link never creates.
 */
export const QuickEntry = ({
  activeOrganizationId,
  canArchive,
  linkedText,
  onLinkedTextRead,
}: {
  activeOrganizationId: string;
  canArchive: boolean;
  linkedText?: string;
  onLinkedTextRead?: () => void;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const money = useFormattedMoney();
  const { compose } = useAppActions();
  const [text, setText] = useState("");
  const [created, setCreated] = useState<{
    source: string;
    transaction: TransactionDetail;
  } | null>(null);

  const orpc = householdOrpc(activeOrganizationId);

  const refresh = () => invalidate(queryClient, activeOrganizationId, "ledger");

  const openForm = (parsed: QuickEntryParse, source: string) =>
    compose({
      kind: parsed.kind,
      onSaved: () => setText(""),
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

  const submit = useMutation({
    meta: { suppressErrorToast: true },
    mutationFn: async ({
      review,
      source,
    }: {
      review: boolean;
      source: string;
    }) => {
      const parsed = await orpc.transactions.parseQuickEntry.call({
        text: source,
      });
      if (review || !parsed.input) {
        return { parsed, transaction: null };
      }
      try {
        return {
          parsed,
          transaction: await orpc.transactions.create.call(parsed.input),
        };
      } catch (error) {
        // Create's own validation said no: finish it in the form instead.
        toastManager.add({
          title: errorMessage(error),
          type: "error",
        });
        return { parsed, transaction: null };
      }
    },
    onError: () => {
      toastManager.add({
        description: "Your text is still there. Try again in a moment.",
        title: "Couldn’t read that entry",
        type: "error",
      });
    },
    onSuccess: async ({ parsed, transaction }, { source }) => {
      if (!transaction) {
        openForm(parsed, source);
        return;
      }
      await refresh();
      setText("");
      setCreated({ source, transaction });
    },
  });

  const undo = useMutation({
    mutationFn: (entry: { source: string; transactionId: string }) =>
      orpc.transactions.archive.call({ transactionId: entry.transactionId }),
    onSuccess: async (_, entry) => {
      await refresh();
      // Back to the line as typed, ready to fix and resubmit.
      setText(entry.source);
      setCreated(null);
      toastManager.add({ title: "Transaction removed", type: "success" });
    },
  });

  const { mutate } = submit;
  // Read once per link, not once per render or per remount of the effect.
  const readLinkedText = useRef<string | null>(null);
  useEffect(() => {
    const linked = linkedText?.trim().slice(0, MAX_LENGTH);
    if (!linked || readLinkedText.current === linkedText) {
      return;
    }
    readLinkedText.current = linkedText ?? null;
    setText(linked);
    mutate({ review: true, source: linked });
    onLinkedTextRead?.();
  }, [linkedText, mutate, onLinkedTextRead]);

  const source = text.trim();

  return (
    <section aria-label="Quick entry" className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (source && !submit.isPending) {
            setCreated(null);
            submit.mutate({ review: false, source });
          }
        }}
      >
        <Input
          aria-describedby="quick-entry-hint"
          aria-label="Quick entry"
          maxLength={MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          placeholder="dinner at jollibee 400 metrobank mc"
          start={<HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />}
          value={text}
        />
        <Button
          disabled={source === ""}
          loading={submit.isPending}
          type="submit"
        >
          Add
        </Button>
      </form>
      <p className="text-muted-foreground text-xs" id="quick-entry-hint">
        Type what, how much and which account. Anything unclear opens the form.
      </p>
      {created ? (
        <Alert variant="success">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} />
          <AlertTitle>
            {created.transaction.type === "income" ? "Income" : "Expense"} added
          </AlertTitle>
          <AlertDescription>
            {summaryOf(created.transaction, money)}
          </AlertDescription>
          <AlertAction>
            {canArchive ? (
              <Button
                loading={undo.isPending}
                onClick={() =>
                  undo.mutate({
                    source: created.source,
                    transactionId: created.transaction.id,
                  })
                }
                size="sm"
                variant="secondary"
              >
                Undo
              </Button>
            ) : null}
            <Button
              onClick={() =>
                navigate({
                  params: { transactionId: created.transaction.id },
                  search: (previous) => previous,
                  to: "/transactions/$transactionId",
                })
              }
              size="sm"
              variant="secondary"
            >
              View
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
    </section>
  );
};
