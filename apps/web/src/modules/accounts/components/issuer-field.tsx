import {
  findCardIssuer,
  resolveCardIssuer,
} from "@masdan/api/card-products/catalog";
import { CARD_ISSUERS } from "@masdan/api/card-products/issuers";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useState } from "react";

const OTHERS = "others";

const ISSUERS = CARD_ISSUERS.toSorted((left, right) =>
  left.shortName.localeCompare(right.shortName)
);

const ITEMS = [
  ...ISSUERS.map((issuer) => ({ label: issuer.shortName, value: issuer.key })),
  { label: "Others", value: OTHERS },
];

/**
 * The card's issuing bank: one of the banks the card catalog knows, or
 * "Others" with the name typed in. Stores the bank's name, as before.
 */
export const IssuerField = ({
  onBlur,
  onChange,
  value,
}: {
  onBlur?: () => void;
  onChange: (institution: string) => void;
  value: string;
}) => {
  const resolved = resolveCardIssuer(value);
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
        items={ITEMS}
        onValueChange={(next) => {
          if (next === OTHERS) {
            setOther(true);
            onChange("");
            return;
          }
          setOther(false);
          onChange(
            typeof next === "string" ? (findCardIssuer(next)?.name ?? "") : ""
          );
        }}
        value={selected}
      >
        <SelectTrigger aria-label="Institution" onBlur={onBlur}>
          <SelectValue placeholder="Choose a bank" />
        </SelectTrigger>
        <SelectPopup>
          {ITEMS.map((item) => (
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
