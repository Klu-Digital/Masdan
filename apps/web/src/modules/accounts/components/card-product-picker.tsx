import {
  cardNetworkLabel,
  cardProductIssue,
  cardProductName,
  cardProductsFor,
  findCardIssuer,
  findCardProduct,
  normalizeCardText,
  resolveCardIssuer,
  resolveCardNetwork,
  suggestCardProducts,
} from "@masdan/api/card-products/catalog";
import type { CardProduct } from "@masdan/api/card-products/vocabulary";
import { Button } from "@masdan/ui/components/button";
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@masdan/ui/components/combobox";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";

import { AccountCard } from "./account-card";

/** What the picker reads from the rest of the card form. */
export interface CardProductIdentity {
  cardLastFour: string | null;
  cardNetwork: string | null;
  color: string | null;
  institution: string;
  name: string;
}

interface ProductOption {
  key: string | null;
  label: string;
  product: CardProduct | null;
  search: string;
}

const MAX_SUGGESTIONS = 3;

const OTHER: ProductOption = {
  key: null,
  label: "Other / not listed",
  product: null,
  search: "other not listed",
};

const optionFor = (product: CardProduct): ProductOption => {
  const issuer = findCardIssuer(product.issuerKey);
  return {
    key: product.key,
    label: cardProductName(product),
    product,
    search: normalizeCardText(
      [
        product.displayName,
        ...(product.aliases ?? []),
        issuer?.name ?? "",
        ...(issuer?.aliases ?? []),
        cardNetworkLabel(product.network) ?? "",
      ].join(" ")
    ),
  };
};

// Every card of the bank, never hidden by network: the chosen network only
// orders the list, since a filtered-out card looks like a missing one.
const bankProducts = (identity: CardProductIdentity): CardProduct[] => {
  const network = resolveCardNetwork(identity.cardNetwork);
  const fits = (product: CardProduct) =>
    network === null ||
    product.network === "unknown" ||
    product.network === network;
  return cardProductsFor({ institution: identity.institution }).toSorted(
    (left, right) => Number(fits(right)) - Number(fits(left))
  );
};

// Any word order: "gold bpi" finds "BPI Gold Rewards".
const matches = (option: ProductOption, query: string): boolean =>
  normalizeCardText(query)
    .split(" ")
    .every((word) => option.search.includes(word));

export const CardProductPicker = ({
  identity,
  onSelect,
  savedKey,
  value,
}: {
  identity: CardProductIdentity;
  onSelect: (product: CardProduct | null) => void;
  savedKey: string | null;
  value: string | null;
}) => {
  const product = findCardProduct(value);
  // A bank typed under "Others" has no catalog products to offer.
  const customBank =
    identity.institution.trim() !== "" &&
    !resolveCardIssuer(identity.institution);
  const options = customBank
    ? [OTHER]
    : [OTHER, ...bankProducts(identity).map(optionFor)];
  const selected = product ? optionFor(product) : null;
  const issue = cardProductIssue(
    { ...identity, cardProductKey: value },
    savedKey
  );
  const retired = value !== null && product === null;
  const suggestions = value
    ? []
    : suggestCardProducts(identity).slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <AccountCard
          account={{
            ...identity,
            cardProductKey: value,
            name: identity.name || "Credit card",
          }}
          className="w-64 max-w-full"
        />
      </div>
      <Field name="cardProductKey">
        <FieldLabel>Card</FieldLabel>
        <Combobox
          filter={matches}
          isItemEqualToValue={(item: ProductOption, current: ProductOption) =>
            item.key === current.key
          }
          itemToStringLabel={(item: ProductOption) => item.label}
          items={options}
          onValueChange={(item: ProductOption | null) =>
            onSelect(item?.product ?? null)
          }
          value={selected}
        >
          <ComboboxInput
            aria-invalid={issue ? true : undefined}
            placeholder="Search cards, or choose Other"
          />
          <ComboboxPopup>
            <ComboboxEmpty>
              No matching card. Choose “Other / not listed”.
            </ComboboxEmpty>
            <ComboboxList>
              <ComboboxCollection>
                {(option: ProductOption) => (
                  <ComboboxItem key={option.key ?? "other"} value={option}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.product ? (
                        <span className="text-muted-foreground text-xs">
                          {[
                            cardNetworkLabel(option.product.network),
                            option.product.status === "legacy"
                              ? "No longer issued"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Network not published"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Use a generic card design
                        </span>
                      )}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>

        {issue ? (
          <div className="flex flex-wrap items-center gap-2">
            <FieldError match>{issue}</FieldError>
            <Button onClick={() => onSelect(null)} size="xs" variant="ghost">
              Clear card
            </Button>
          </div>
        ) : null}
        {retired && !issue ? (
          <p className="text-muted-foreground text-xs">
            This card’s design is no longer in Masdan’s catalog, so it shows as
            a generic card. Choose a card to replace it.
          </p>
        ) : null}
        {value || issue ? null : (
          <p className="text-muted-foreground text-xs">
            Optional. Unlisted cards use a generic design.
          </p>
        )}

        {suggestions.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {suggestions.length === 1 ? "Looks like" : "Could be"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  className="bg-secondary hover:bg-accent focus-visible:ring-ring/50 h-7 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
                  key={suggestion.key}
                  onClick={() => onSelect(suggestion)}
                  type="button"
                >
                  {cardProductName(suggestion)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Field>
    </div>
  );
};
