import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { invalidateImport } from "@/modules/imports/queries";
import type { ImportRow } from "@/modules/imports/queries";
import { client } from "@/utils/orpc";

import { importSuggestionSummaryQueryOptions } from "../queries";
import { SuggestionEditor } from "./suggestion-editor";
import type { SuggestionChoice, SuggestionTag } from "./suggestion-editor";

interface ReviewCategory {
  archivedAt: Date | null;
  color: string;
  icon: string;
  id: string;
  name: string;
  type: string;
}

const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/**
 * Asks for suggestions on rows still on the import's default category, a
 * batch at a time, and accepts every pending one in one go.
 */
export const ImportSuggestionsBar = ({ importId }: { importId: string }) => {
  const queryClient = useQueryClient();
  const summary = useQuery(importSuggestionSummaryQueryOptions(importId));

  const suggest = useMutation({
    mutationFn: () => client.suggestions.forImport({ importId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (result) => {
      if (result.status === "unavailable") {
        toastManager.add({ title: result.message, type: "error" });
        return;
      }
      await invalidateImport(queryClient, importId);
    },
  });
  const acceptAll = useMutation({
    mutationFn: () => client.suggestions.acceptAllForImport({ importId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async (result) => {
      await invalidateImport(queryClient, importId);
      toastManager.add({
        title: `Accepted ${plural(result.accepted, "suggestion", "suggestions")}`,
        type: "success",
      });
    },
  });

  const pending = summary.data?.pending ?? 0;
  const unsuggested = summary.data?.unsuggested ?? 0;
  if (pending === 0 && unsuggested === 0) {
    return null;
  }

  return (
    <section
      aria-label="Suggestions"
      className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:ring-1"
    >
      <p className="flex items-start gap-2">
        <HugeiconsIcon
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
          icon={AiMagicIcon}
          strokeWidth={1.8}
        />
        <span>
          {pending > 0
            ? `${plural(pending, "suggestion awaits", "suggestions await")} your review. Rows keep their category until you accept.`
            : `${plural(unsuggested, "row is", "rows are")} on the default category. Suggestions read only the description.`}
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        {unsuggested > 0 ? (
          <Button
            loading={suggest.isPending}
            onClick={() => suggest.mutate()}
            size="sm"
            variant="secondary"
          >
            {pending > 0 ? "Suggest more" : "Suggest categories"}
          </Button>
        ) : null}
        {pending > 0 ? (
          <Button
            loading={acceptAll.isPending}
            onClick={() => acceptAll.mutate()}
            size="sm"
          >
            {`Accept all ${pending.toLocaleString()}`}
          </Button>
        ) : null}
      </div>
    </section>
  );
};

/** One row's suggestion: accept as proposed, edit then accept, or reject. */
export const ImportRowSuggestion = ({
  canReview,
  categories,
  importId,
  row,
  tags,
}: {
  canReview: boolean;
  categories: ReviewCategory[];
  importId: string;
  row: ImportRow;
  tags: SuggestionTag[];
}) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const resolve = useMutation({
    mutationFn: (
      decision: ({ action: "accept" } & SuggestionChoice) | { action: "reject" }
    ) =>
      client.suggestions.resolveImportRows({
        decisions: [{ ...decision, rowId: row.id }],
        importId,
      }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      setEditing(false);
      await invalidateImport(queryClient, importId);
    },
  });

  const { suggestion } = row;
  if (row.suggestionApplication) {
    return (
      <span className="text-muted-foreground mt-0.5 block text-xs">
        <Badge size="sm" variant="brand">
          Suggestion
        </Badge>{" "}
        Accepted
      </span>
    );
  }
  if (suggestion?.status !== "pending" || row.status !== "valid") {
    return null;
  }

  const { suggested } = suggestion;
  const categoryId = suggested.categoryId ?? row.categoryId ?? "";
  const categoryName =
    categories.find(({ id }) => id === categoryId)?.name ?? "—";
  const suggestedTags = tags.filter(({ id }) => suggested.tagIds.includes(id));
  const summary = [
    categoryName,
    ...suggestedTags.map(({ name }) => `#${name}`),
  ].join(" · ");

  if (editing) {
    return (
      <div className="mt-2 max-w-80">
        <SuggestionEditor
          categories={categories.filter(
            (item) => item.archivedAt === null && item.type === row.type
          )}
          initialCategoryId={categoryId}
          loading={resolve.isPending}
          onAccept={(choice) => resolve.mutate({ action: "accept", ...choice })}
          onReject={() => setEditing(false)}
          rejectLabel="Cancel"
          suggestedTags={suggestedTags}
        />
      </div>
    );
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <Badge size="sm" variant="info">
        Suggested
      </Badge>
      <span className="text-foreground font-medium">{summary}</span>
      {canReview ? (
        <span className="flex gap-1">
          <Button
            loading={resolve.isPending}
            onClick={() =>
              resolve.mutate({
                action: "accept",
                categoryId,
                tagIds: suggested.tagIds,
              })
            }
            size="xs"
            variant="secondary"
          >
            Accept
          </Button>
          <Button onClick={() => setEditing(true)} size="xs" variant="ghost">
            Edit
          </Button>
          <Button
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ action: "reject" })}
            size="xs"
            variant="ghost"
          >
            Reject
          </Button>
        </span>
      ) : null}
    </span>
  );
};
