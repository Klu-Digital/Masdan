import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import { IconTile } from "@masdan/ui/components/icon-tile";

export interface PickerCategory {
  color: string;
  icon: string;
  id: string;
  name: string;
}

/** Search-as-you-type category choice; the chosen emoji rides in the field. */
export const CategoryPicker = <T extends PickerCategory>({
  "aria-invalid": ariaInvalid,
  ariaLabel = "Category",
  categories,
  onValueChange,
  placeholder = "Choose a category",
  showClear = false,
  value,
}: {
  "aria-invalid"?: boolean;
  ariaLabel?: string;
  categories: T[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  showClear?: boolean;
  value: string;
}) => {
  const selected = categories.find((category) => category.id === value) ?? null;

  return (
    <Combobox
      itemToStringLabel={(item: T) => item.name}
      items={categories}
      onValueChange={(item: T | null) => onValueChange(item?.id ?? "")}
      value={selected}
    >
      <ComboboxInput
        aria-invalid={ariaInvalid || undefined}
        aria-label={ariaLabel}
        clearProps={{ "aria-label": "Clear category" }}
        placeholder={placeholder}
        showClear={showClear}
        startAddonWide
        startAddon={
          selected ? (
            <IconTile tint={selected.color} size="xs">
              {selected.icon}
            </IconTile>
          ) : undefined
        }
      />
      <ComboboxPopup>
        <ComboboxEmpty>No matching category.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(category: T) => (
              <ComboboxItem key={category.id} value={category}>
                <span className="flex items-center gap-2.5">
                  <IconTile tint={category.color} size="sm">
                    {category.icon}
                  </IconTile>
                  {category.name}
                </span>
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
};
