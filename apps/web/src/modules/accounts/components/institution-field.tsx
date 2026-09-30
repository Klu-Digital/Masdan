import { normalizeCardText } from "@masdan/card-catalog/catalog";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import { Input } from "@masdan/ui/components/input";
import { useState } from "react";

import { InstitutionLogo } from "@/components/finance/institution-logo";

import type { CatalogInstitution } from "../interest";

export interface InstitutionValue {
  institution: string;
  institutionId: string | null;
}

interface Option {
  id: string | null;
  institution: CatalogInstitution | null;
  label: string;
  search: string;
}

const OTHER: Option = {
  id: null,
  institution: null,
  label: "Other / not listed",
  search: "other not listed",
};

const optionFor = (institution: CatalogInstitution): Option => ({
  id: institution.id,
  institution,
  label: institution.shortName,
  search: normalizeCardText(
    [institution.name, institution.shortName, ...institution.aliases].join(" ")
  ),
});

const matches = (option: Option, query: string): boolean =>
  normalizeCardText(query)
    .split(" ")
    .every((word) => option.search.includes(word));

/**
 * A bank Masdan knows, with its logo, or "Other" with the name typed in. The
 * name is stored either way, so an account never depends on the catalog.
 */
export const InstitutionField = ({
  institutions,
  onBlur,
  onChange,
  value,
}: {
  institutions: readonly CatalogInstitution[];
  onBlur?: () => void;
  onChange: (value: InstitutionValue) => void;
  value: InstitutionValue;
}) => {
  const known = institutions.find(({ id }) => id === value.institutionId);
  const [other, setOther] = useState(
    () => !known && value.institution.trim() !== ""
  );
  const options = [...institutions.map(optionFor), OTHER];
  let selected: Option | null = null;
  if (known) {
    selected = optionFor(known);
  } else if (other) {
    selected = OTHER;
  }

  return (
    <div className="flex flex-col gap-2">
      <Combobox
        filter={matches}
        isItemEqualToValue={(item: Option, current: Option) =>
          item.id === current.id
        }
        itemToStringLabel={(item: Option) => item.label}
        items={options}
        onValueChange={(item: Option | null) => {
          if (!item) {
            setOther(false);
            onChange({ institution: "", institutionId: null });
            return;
          }
          setOther(item.id === null);
          onChange(
            item.institution
              ? {
                  institution: item.institution.name,
                  institutionId: item.institution.id,
                }
              : { institution: "", institutionId: null }
          );
        }}
        value={selected}
      >
        <ComboboxInput
          aria-label="Institution"
          onBlur={onBlur}
          placeholder="Search banks, or choose Other"
        />
        <ComboboxPopup>
          <ComboboxEmpty>No matching bank. Choose “Other”.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(option: Option) => (
                <ComboboxItem key={option.id ?? "other"} value={option}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <InstitutionLogo
                      institution={option.institution}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.institution &&
                      option.institution.name !== option.label ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {option.institution.name}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      {selected === OTHER ? (
        <Input
          aria-label="Institution name"
          onBlur={onBlur}
          onChange={(event) =>
            onChange({ institution: event.target.value, institutionId: null })
          }
          placeholder="Institution name"
          value={value.institution}
        />
      ) : null}
    </div>
  );
};
