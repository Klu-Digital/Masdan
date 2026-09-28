import { Button } from "@masdan/ui/components/button";
import { ColorDot } from "@masdan/ui/components/icon-tile";
import { useState } from "react";

import { CategoryPicker } from "@/modules/categories/components/category-picker";
import type { PickerCategory } from "@/modules/categories/components/category-picker";

export interface SuggestionTag {
  color: string;
  id: string;
  name: string;
}

export interface SuggestionChoice {
  categoryId: string;
  tagIds: string[];
}

/**
 * The suggested category and tags as editable defaults. Nothing is saved
 * until Accept, and Accept sends exactly what is on screen.
 */
export const SuggestionEditor = ({
  acceptLabel = "Accept",
  categories,
  initialCategoryId,
  loading,
  onAccept,
  onReject,
  rejectLabel = "Dismiss",
  suggestedTags,
}: {
  acceptLabel?: string;
  categories: PickerCategory[];
  initialCategoryId: string;
  loading: boolean;
  onAccept: (choice: SuggestionChoice) => void;
  onReject: () => void;
  rejectLabel?: string;
  suggestedTags: SuggestionTag[];
}) => {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [tagIds, setTagIds] = useState(suggestedTags.map(({ id }) => id));

  return (
    <div className="flex flex-col gap-3">
      <CategoryPicker
        ariaLabel="Suggested category"
        categories={categories}
        onValueChange={setCategoryId}
        value={categoryId}
      />
      {suggestedTags.length > 0 ? (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Suggested tags</legend>
          {suggestedTags.map((tag) => {
            const selected = tagIds.includes(tag.id);
            return (
              <button
                aria-pressed={selected}
                className="bg-secondary hover:bg-accent aria-pressed:bg-brand-soft aria-pressed:text-brand-text focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
                key={tag.id}
                onClick={() =>
                  setTagIds(
                    selected
                      ? tagIds.filter((id) => id !== tag.id)
                      : [...tagIds, tag.id]
                  )
                }
                type="button"
              >
                <ColorDot tint={tag.color} />
                {tag.name}
              </button>
            );
          })}
        </fieldset>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={!categoryId}
          loading={loading}
          onClick={() => onAccept({ categoryId, tagIds })}
          size="sm"
        >
          {acceptLabel}
        </Button>
        <Button disabled={loading} onClick={onReject} size="sm" variant="ghost">
          {rejectLabel}
        </Button>
      </div>
    </div>
  );
};
