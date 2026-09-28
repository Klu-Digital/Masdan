import { cardCountriesFor } from "@masdan/card-catalog/countries";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useState } from "react";

import { useCardCatalog } from "../card-catalog";

const OTHERS = "others";

/**
 * The card's issuing bank: one of the banks the card catalog knows, or
 * "Others" with the name typed in. Stores the bank's name, as before. Offers
 * the banks of the currency's country, else of every country loaded.
 */
export const IssuerField = ({
  currencyCode,
  onBlur,
  onChange,
  value,
}: {
  currencyCode: string;
  onBlur?: () => void;
  onChange: (institution: string) => void;
  value: string;
}) => {
  const catalog = useCardCatalog(cardCountriesFor([currencyCode]));
  const countries = catalog.scope([currencyCode]);
  const items = [
    ...catalog
      .issuersIn(countries)
      .toSorted((left, right) => left.shortName.localeCompare(right.shortName))
      .map((issuer) => ({ label: issuer.shortName, value: issuer.key })),
    { label: "Others", value: OTHERS },
  ];
  const resolved = catalog.resolveIssuer(value, countries);
  const [other, setOther] = useState(() => value.trim() !== "" && !resolved);
  let selected: string | null = null;
  if (resolved) {
    selected = resolved.key;
  } else if (other) {
    selected = OTHERS;
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={items}
        onValueChange={(next) => {
          if (next === OTHERS) {
            setOther(true);
            onChange("");
            return;
          }
          setOther(false);
          onChange(
            typeof next === "string"
              ? (catalog.findIssuer(next)?.name ?? "")
              : ""
          );
        }}
        value={selected}
      >
        <SelectTrigger aria-label="Institution" onBlur={onBlur}>
          <SelectValue placeholder="Choose a bank" />
        </SelectTrigger>
        <SelectPopup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {selected === OTHERS ? (
        <Input
          aria-label="Bank name"
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Bank name"
          value={value}
        />
      ) : null}
    </div>
  );
};
