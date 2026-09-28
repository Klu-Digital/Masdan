import type { CountryCards } from "./vocabulary";

export interface CardCountry {
  /** ISO 3166-1 alpha-2, lowercase: the prefix of every key in the country. */
  code: string;
  name: string;
  /** ISO 4217 codes an account in this country is usually kept in. */
  currencies: readonly string[];
}

// Small and always bundled; each country's cards load on demand below.
export const CARD_COUNTRIES = [
  { code: "ph", currencies: ["PHP"], name: "Philippines" },
] as const satisfies readonly CardCountry[];

export type CardCountryCode = (typeof CARD_COUNTRIES)[number]["code"];

// A dynamic import each, so a browser downloads only the countries it shows.
const LOADERS: Record<CardCountryCode, () => Promise<CountryCards>> = {
  ph: async () => {
    const { PH_CARDS } = await import("./countries/ph/cards");
    return PH_CARDS;
  },
};

export const loadCardCountry = (code: CardCountryCode): Promise<CountryCards> =>
  LOADERS[code]();

const CODES = new Set<string>(CARD_COUNTRIES.map(({ code }) => code));

export const isCardCountry = (value: string): value is CardCountryCode =>
  CODES.has(value);

/** The country a product or issuer key belongs to, if it is one we know. */
export const cardCountryOfKey = (
  key: string | null | undefined
): CardCountryCode | null => {
  const prefix = key?.split("-", 1)[0] ?? "";
  return isCardCountry(prefix) ? prefix : null;
};

/** Countries whose cards are kept in these currencies, in the order given. */
export const cardCountriesFor = (
  currencies: readonly (string | null | undefined)[]
): CardCountryCode[] => {
  const found = new Set<CardCountryCode>();
  for (const currency of currencies) {
    for (const country of CARD_COUNTRIES) {
      const accepted: readonly string[] = country.currencies;
      if (currency && accepted.includes(currency.toUpperCase())) {
        found.add(country.code);
      }
    }
  }
  return [...found];
};
