import { cardCountriesFor } from "./countries";
import type { CardCountryCode } from "./countries";
import { CARD_NETWORK_LABELS } from "./vocabulary";
import type {
  CardIssuer,
  CardNetwork,
  CardProduct,
  CardProductVisual,
  CountryCards,
  HexColor,
} from "./vocabulary";

export const CARD_PRODUCT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const COMBINING_MARKS = /\p{M}/gu;
const NON_ALPHANUMERIC = /[^a-z0-9]+/gu;

/** Case, accent and punctuation blind: "Banco de Oro, Inc." matches. */
export const normalizeCardText = (value: string): string =>
  value
    .normalize("NFKD")
    .replaceAll(COMBINING_MARKS, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(NON_ALPHANUMERIC, " ")
    .trim();

const tokensOf = (value: string): string[] =>
  normalizeCardText(value).split(" ").filter(Boolean);

export const NETWORK_ALIASES: ReadonlyMap<string, CardNetwork> = new Map<
  string,
  CardNetwork
>([
  ["amex", "amex"],
  ["american express", "amex"],
  ["china unionpay", "unionpay"],
  ["cup", "unionpay"],
  ["diners", "diners"],
  ["diners club", "diners"],
  ["discover", "discover"],
  ["jcb", "jcb"],
  ["master card", "mastercard"],
  ["mastercard", "mastercard"],
  ["mc", "mastercard"],
  ["union pay", "unionpay"],
  ["unionpay", "unionpay"],
  ["visa", "visa"],
]);

/** `null` when unset; `unknown` when set to a network we don't model. */
export const resolveCardNetwork = (
  value: string | null | undefined
): CardNetwork | null => {
  const text = normalizeCardText(value ?? "");
  if (!text) {
    return null;
  }
  return NETWORK_ALIASES.get(text) ?? "unknown";
};

/** The label `card_network` stores for a network, or null for `unknown`. */
export const cardNetworkLabel = (network: CardNetwork): string | null =>
  network === "unknown" ? null : CARD_NETWORK_LABELS[network];

const HEX_CHANNELS = /[0-9a-f]{2}/giu;
const PALE_LUMINANCE = 0.4;

/** WCAG relative luminance of a `#rrggbb` colour. */
const luminance = (hex: HexColor): number => {
  const [r = 0, g = 0, b = 0] = (hex.slice(1).match(HEX_CHANNELS) ?? []).map(
    (channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    }
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const darken = (hex: HexColor, amount: number): HexColor => {
  const channels = hex.slice(1).match(HEX_CHANNELS) ?? [];
  return `#${channels
    .map((channel) =>
      Math.round(Number.parseInt(channel, 16) * (1 - amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

/** A known bank's card without a product: its colours, never a product's art. */
export const issuerCardVisual = (issuer: CardIssuer): CardProductVisual =>
  // A pale brand (Zed's yellow) stays pale with dark ink; darkening it to
  // carry white text would lose the colour people recognise.
  luminance(issuer.brandColor) > PALE_LUMINANCE
    ? {
        background: {
          angle: 135,
          stops: [issuer.brandColor, darken(issuer.brandColor, 0.08)],
        },
        foreground: "dark",
        pattern: "fine-lines",
      }
    : {
        background: {
          angle: 135,
          stops: [
            darken(issuer.brandColor, 0.08),
            darken(issuer.brandColor, 0.5),
          ],
        },
        foreground: "light",
        pattern: "fine-lines",
      };

// English, and the networks: words in any card's name that pick no product.
const IGNORED_NAME_TOKENS: readonly string[] = [
  "amex",
  "american",
  "card",
  "cards",
  "credit",
  "express",
  "jcb",
  "master",
  "mastercard",
  "my",
  "the",
  "unionpay",
  "visa",
];

const networkMentionedIn = (name: string): CardNetwork | null => {
  const text = ` ${normalizeCardText(name)} `;
  for (const [alias, network] of NETWORK_ALIASES) {
    if (alias.length > 2 && text.includes(` ${alias} `)) {
      return network;
    }
  }
  return null;
};

const networkFits = (product: CardProduct, network: CardNetwork | null) =>
  network === null ||
  product.network === "unknown" ||
  product.network === network;

export interface CardIdentity {
  cardNetwork?: string | null;
  institution?: string | null;
}

// Free text resolves per country: "Citi" is UnionBank in the Philippines.
export interface CardCatalog {
  countries: readonly CardCountryCode[];
  issuers: readonly CardIssuer[];
  products: readonly CardProduct[];
  findIssuer: (key: string) => CardIssuer | null;
  findProduct: (key: string | null | undefined) => CardProduct | null;
  /** Countries for these currencies, else every loaded one. */
  scope: (
    currencies: readonly (string | null | undefined)[]
  ) => readonly CardCountryCode[];
  issuersIn: (countries: readonly CardCountryCode[]) => readonly CardIssuer[];
  /** The known issuer an account's free-text institution names, if any. */
  resolveIssuer: (
    institution: string | null | undefined,
    countries: readonly CardCountryCode[]
  ) => CardIssuer | null;
  /** "BPI Gold Rewards", but "Petron BPI", not "BPI Petron BPI". */
  productName: (product: CardProduct) => string;
  /** An unrecognised issuer narrows nothing: the picker searches everything. */
  productsFor: (
    identity: CardIdentity,
    countries: readonly CardCountryCode[]
  ) => readonly CardProduct[];
  isProductCompatible: (
    product: CardProduct,
    identity: CardIdentity
  ) => boolean;
  /** Why a product can't go on this card, or null when it can. */
  productIssue: (
    values: CardIdentity & { cardProductKey?: string | null },
    savedKey?: string | null
  ) => string | null;
  /** Every product tied for best, so no caller guesses one of several. */
  suggest: (
    identity: CardIdentity & { name?: string | null },
    countries: readonly CardCountryCode[]
  ) => readonly CardProduct[];
}

interface Alias {
  alias: string;
  issuer: CardIssuer;
}

export const createCardCatalog = (
  loaded: readonly CountryCards[]
): CardCatalog => {
  const countries = loaded.map(({ country }) => country);
  const issuers = loaded.flatMap((cards) => cards.issuers);
  const products = loaded.flatMap((cards) => cards.products);
  const issuersByKey = new Map(issuers.map((issuer) => [issuer.key, issuer]));
  const productsByKey = new Map(
    products.map((product) => [product.key, product])
  );
  const cardsByCountry = new Map(loaded.map((cards) => [cards.country, cards]));

  // Longest first, so "union bank of the philippines" wins over a shorter alias.
  const aliasesByCountry = new Map<CardCountryCode, Alias[]>(
    loaded.map((cards) => [
      cards.country,
      cards.issuers
        .flatMap((issuer) =>
          [issuer.name, issuer.shortName, ...issuer.aliases].map((alias) => ({
            alias: normalizeCardText(alias),
            issuer,
          }))
        )
        .toSorted((left, right) => right.alias.length - left.alias.length),
    ])
  );

  const findAlias = (
    countriesInOrder: readonly CardCountryCode[],
    matches: (alias: string) => boolean
  ): CardIssuer | null => {
    for (const country of countriesInOrder) {
      const found = aliasesByCountry
        .get(country)
        ?.find(({ alias }) => matches(alias));
      if (found) {
        return found.issuer;
      }
    }
    return null;
  };

  const findIssuer = (key: string): CardIssuer | null =>
    issuersByKey.get(key) ?? null;

  const findProduct = (key: string | null | undefined): CardProduct | null =>
    key ? (productsByKey.get(key) ?? null) : null;

  const resolveIssuer: CardCatalog["resolveIssuer"] = (institution, within) => {
    const text = normalizeCardText(institution ?? "");
    if (!text) {
      return null;
    }
    return findAlias(
      within,
      (alias) => text === alias || text.startsWith(`${alias} `)
    );
  };

  const countryOf = (product: CardProduct): readonly CardCountryCode[] => {
    const country = findIssuer(product.issuerKey)?.country;
    return country ? [country] : [];
  };

  const productName = (product: CardProduct): string => {
    const issuer = findIssuer(product.issuerKey);
    if (!issuer) {
      return product.displayName;
    }
    const name = ` ${normalizeCardText(product.displayName)} `;
    return name.includes(` ${normalizeCardText(issuer.shortName)} `)
      ? product.displayName
      : `${issuer.shortName} ${product.displayName}`;
  };

  const inCountries = (within: readonly CardCountryCode[]) => {
    const keys = new Set(
      issuers
        .filter((issuer) => within.includes(issuer.country))
        .map(({ key }) => key)
    );
    return products.filter((product) => keys.has(product.issuerKey));
  };

  const isProductCompatible: CardCatalog["isProductCompatible"] = (
    product,
    identity
  ) =>
    resolveIssuer(identity.institution, countryOf(product))?.key ===
      product.issuerKey &&
    networkFits(product, resolveCardNetwork(identity.cardNetwork));

  return {
    countries,
    findIssuer,
    findProduct,
    isProductCompatible,
    issuers,
    issuersIn: (within) =>
      issuers.filter((issuer) => within.includes(issuer.country)),
    productIssue: (values, savedKey) => {
      const key = values.cardProductKey;
      if (!key) {
        return null;
      }
      const product = findProduct(key);
      // A retired `savedKey` stays saveable, or cards holding one could never
      // be edited again.
      if (!product) {
        return key === savedKey ? null : "Choose a card from the list";
      }
      const issuer = findIssuer(product.issuerKey);
      if (
        resolveIssuer(values.institution, countryOf(product))?.key !==
        product.issuerKey
      ) {
        return `${productName(product)} is issued by ${issuer?.name ?? product.issuerKey}`;
      }
      if (!networkFits(product, resolveCardNetwork(values.cardNetwork))) {
        return `${productName(product)} is a ${cardNetworkLabel(product.network)} card`;
      }
      return null;
    },
    productName,
    products,
    productsFor: (identity, within) => {
      const issuer = resolveIssuer(identity.institution, within);
      const network = resolveCardNetwork(identity.cardNetwork);
      return inCountries(within).filter(
        (product) =>
          (!issuer || product.issuerKey === issuer.key) &&
          networkFits(product, network)
      );
    },
    resolveIssuer,
    // A USD card from a Philippine bank still resolves in a Philippine home.
    scope: (currencies) => {
      const found = cardCountriesFor(currencies).filter((country) =>
        cardsByCountry.has(country)
      );
      return found.length > 0 ? found : countries;
    },
    suggest: (identity, within) => {
      const name = identity.name ?? "";
      const issuer =
        resolveIssuer(identity.institution, within) ??
        findAlias(within, (alias) =>
          ` ${normalizeCardText(name)} `.includes(` ${alias} `)
        );
      if (!issuer) {
        return [];
      }
      const network =
        resolveCardNetwork(identity.cardNetwork) ?? networkMentionedIn(name);

      const ignored = new Set([
        ...IGNORED_NAME_TOKENS,
        ...(cardsByCountry.get(issuer.country)?.nameStopWords ?? []).flatMap(
          tokensOf
        ),
      ]);
      const issuerTokens = new Set([
        ...tokensOf(issuer.name),
        ...tokensOf(issuer.shortName),
      ]);
      const nameTokens = new Set(
        tokensOf(name).filter(
          (token) => !(issuerTokens.has(token) || ignored.has(token))
        )
      );
      if (nameTokens.size === 0) {
        return [];
      }

      const scored = products
        .filter(
          (product) =>
            product.issuerKey === issuer.key && networkFits(product, network)
        )
        .map((product) => {
          const productTokens = new Set(
            [product.displayName, ...(product.aliases ?? [])].flatMap(tokensOf)
          );
          const matched = [...nameTokens].filter((token) =>
            productTokens.has(token)
          ).length;
          // "Rewards" ranks above "Gold Rewards" for a card named "BPI Rewards".
          const unmatched = tokensOf(product.displayName).filter(
            (token) => !(nameTokens.has(token) || ignored.has(token))
          ).length;
          return { matched, product, unmatched };
        });

      const best = Math.max(0, ...scored.map(({ matched }) => matched));
      if (best === 0) {
        return [];
      }
      return scored
        .filter(({ matched }) => matched === best)
        .toSorted((left, right) => left.unmatched - right.unmatched)
        .map(({ product }) => product);
    },
  };
};
