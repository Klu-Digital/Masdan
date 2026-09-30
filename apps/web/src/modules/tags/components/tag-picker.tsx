import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxValue,
} from "@masdan/ui/components/combobox";
import { ColorDot } from "@masdan/ui/components/icon-tile";

export interface PickerTag {
  color: string;
  id: string;
  name: string;
}

/** Search-as-you-type multi-select of tags, each shown with its colour. */
export const TagPicker = <T extends PickerTag>({
  ariaLabel,
  onValueChange,
  placeholder = "Search tags",
  tags,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  tags: T[];
  value: string[];
}) => {
  const selected = tags.filter((tag) => value.includes(tag.id));

  return (
    <Combobox
      itemToStringLabel={(item: T) => item.name}
      items={tags}
      multiple
      onValueChange={(items: T[]) =>
        onValueChange(items.map((item) => item.id))
      }
      value={selected}
    >
      <ComboboxChips>
        <ComboboxValue>
          {(items: T[]) => (
            <>
              {items.map((tag) => (
                <ComboboxChip aria-label={tag.name} key={tag.id}>
                  <span className="flex items-center gap-1.5">
                    <ColorDot tint={tag.color} />
                    {tag.name}
                  </span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={ariaLabel}
                placeholder={items.length > 0 ? "" : placeholder}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxPopup>
        <ComboboxEmpty>No matching tag.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(tag: T) => (
              <ComboboxItem key={tag.id} value={tag}>
                <span className="flex items-center gap-2.5">
                  <ColorDot className="size-2.5" tint={tag.color} />
                  {tag.name}
                </span>
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
};
