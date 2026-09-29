import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useHousehold } from "@/hooks/use-household";
import type { TransactionDetail } from "@/modules/transactions/types";
import { invalidate } from "@/utils/invalidate";
import { householdOrpc } from "@/utils/orpc";

import { SuggestionEditor } from "./suggestion-editor";
import type { SuggestionChoice } from "./suggestion-editor";

type Applied = NonNullable<TransactionDetail["suggestionApplication"]>;

const wasEdited = (applied: Applied): boolean =>
  applied.categoryId !== (applied.suggested.categoryId ?? applied.categoryId) ||
  applied.tagIds.length !== applied.suggested.tagIds.length ||
  applied.tagIds.some((id) => !applied.suggested.tagIds.includes(id));

/** Mirrors the server: no transfers, archived rows, splits, or empty notes. */
const isEligible = (
  transaction: Pick<
    TransactionDetail,
    "archivedAt" | "notes" | "splits" | "transfer"
  >
): boolean =>
  transaction.transfer === null &&
  transaction.archivedAt === null &&
  transaction.splits.length === 0 &&
  Boolean(transaction.notes?.trim());

/**
 * Asks for a category and tags on request, and shows whether the current
 * ones came from an accepted suggestion. Nothing changes until Accept.
 */
export const TransactionSuggestion = ({
  canAccept,
  transaction,
}: {
  canAccept: boolean;
  transaction: Pick<
    TransactionDetail,
    | "archivedAt"
    | "categoryId"
    | "id"
    | "notes"
    | "splits"
    | "suggestionApplication"
    | "tags"
    | "transfer"
    | "type"
  >;
}) => {
  const enabled = useFeatureFlag("FF__AI_CATEGORIZATION");
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useHousehold();
  const orpc = householdOrpc(activeOrganizationId);
  const categories = useQuery(
    orpc.categories.list.queryOptions({ input: { includeArchived: true } })
  );
  const tags = useQuery(
    orpc.tags.list.queryOptions({ input: { includeArchived: true } })
  );

  const suggest = useMutation(
    orpc.suggestions.forTransaction.mutationOptions()
  );
  const result = suggest.data;
  const suggested = result?.status === "suggested" ? result.suggested : null;

  const accept = useMutation({
    mutationFn: (choice: SuggestionChoice) =>
      orpc.suggestions.acceptForTransaction.call({
        ...choice,
        suggested: suggested ?? { categoryId: null, tagIds: [] },
        transactionId: transaction.id,
      }),
    onSuccess: async () => {
      suggest.reset();
      await invalidate(queryClient, activeOrganizationId, "ledger");
      toastManager.add({ title: "Suggestion accepted", type: "success" });
    },
  });

  const canSuggest = enabled && canAccept && isEligible(transaction);
  const applied = transaction.suggestionApplication;
  if (!(applied || canSuggest)) {
    return null;
  }

  const choices = (categories.data ?? []).filter(
    (item) => item.archivedAt === null && item.type === transaction.type
  );
  const suggestedTags = (tags.data ?? []).filter(({ id }) =>
    suggested?.tagIds.includes(id)
  );

  let body = null;
  if (suggested) {
    body = (
      <SuggestionEditor
        categories={choices}
        initialCategoryId={suggested.categoryId ?? transaction.categoryId ?? ""}
        loading={accept.isPending}
        onAccept={(choice) => accept.mutate(choice)}
        onReject={() => suggest.reset()}
        suggestedTags={suggestedTags}
      />
    );
  } else if (result && result.status !== "suggested") {
    body = (
      <p aria-live="polite" className="text-muted-foreground text-xs">
        {result.message}
      </p>
    );
  } else if (canSuggest) {
    body = (
      <Button
        className="self-start"
        loading={suggest.isPending}
        onClick={() => suggest.mutate({ transactionId: transaction.id })}
        size="sm"
        variant="secondary"
      >
        Suggest a category
      </Button>
    );
  }

  return (
    <section aria-label="Suggestions" className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-4 text-xs font-medium">
        Suggestions
      </h3>
      <div className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm dark:ring-1">
        {applied ? (
          <p className="flex items-center gap-2">
            <HugeiconsIcon
              className="text-muted-foreground size-4"
              icon={AiMagicIcon}
              strokeWidth={1.8}
            />
            <span>
              {wasEdited(applied)
                ? "From a suggestion you edited, then accepted"
                : "From a suggestion you accepted"}
            </span>
          </p>
        ) : null}
        {body}
      </div>
    </section>
  );
};
