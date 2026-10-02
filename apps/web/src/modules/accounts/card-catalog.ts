import { createCardCatalog } from "@masdan/card-catalog/catalog";
import type { CardCatalog } from "@masdan/card-catalog/catalog";
import {
  cardCountriesFor,
  cardCountryOfKey,
  isCardCountry,
  loadCardCountry,
} from "@masdan/card-catalog/countries";
import type { CardCountryCode } from "@masdan/card-catalog/countries";
import type { CountryCards } from "@masdan/card-catalog/vocabulary";
import { useEffect, useSyncExternalStore } from "react";

// The browser holds only the countries something has asked for, so a
// household in Manila never downloads another country's cards.
const loaded: CountryCards[] = [];
const loading = new Map<CardCountryCode, Promise<void>>();
const listeners = new Set<() => void>();
let catalog = createCardCatalog(loaded);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const fetchCountry = async (country: CardCountryCode): Promise<void> => {
  try {
    loaded.push(await loadCardCountry(country));
  } catch {
    // A failed chunk leaves generic cards showing; the next card that needs
    // this country tries again.
    loading.delete(country);
    return;
  }
  catalog = createCardCatalog(loaded);
  for (const listener of listeners) {
    listener();
  }
};

const load = (country: CardCountryCode): Promise<void> => {
  const pending = loading.get(country) ?? fetchCountry(country);
  loading.set(country, pending);
  return pending;
};

export const loadCardCountries = async (
  countries: readonly CardCountryCode[]
): Promise<void> => {
  await Promise.all(countries.map(load));
};

/** The countries a card's key and currency point at. */
export const cardCountriesOf = (card: {
  cardProductKey?: string | null;
  currencyCode?: string | null;
}): CardCountryCode[] => {
  const keyed = cardCountryOfKey(card.cardProductKey);
  return [
    ...new Set([
      ...(keyed ? [keyed] : []),
      ...cardCountriesFor([card.currencyCode]),
    ]),
  ];
};

export const useCardCatalog = (
  countries: readonly CardCountryCode[] = []
): CardCatalog => {
  const current = useSyncExternalStore(subscribe, () => catalog);
  const wanted = countries.join(",");
  useEffect(() => {
    if (wanted) {
      void loadCardCountries(wanted.split(",").filter(isCardCountry));
    }
  }, [wanted]);
  return current;
};
