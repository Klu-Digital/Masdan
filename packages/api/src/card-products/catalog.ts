import { CARD_ISSUERS } from "./issuers";
import { AUB_PRODUCTS } from "./products/aub";
import { BANKCOM_PRODUCTS } from "./products/bankcom";
import { BDO_PRODUCTS } from "./products/bdo";
import { BPI_PRODUCTS } from "./products/bpi";
import { CHINABANK_PRODUCTS } from "./products/chinabank";
import { EASTWEST_PRODUCTS } from "./products/eastwest";
import { EQUICOM_PRODUCTS } from "./products/equicom";
import { HOMECREDIT_PRODUCTS } from "./products/homecredit";
import { HSBC_PRODUCTS } from "./products/hsbc";
import { LANDBANK_PRODUCTS } from "./products/landbank";
import { MAYA_PRODUCTS } from "./products/maya";
import { MAYBANK_PRODUCTS } from "./products/maybank";
import { METROBANK_PRODUCTS } from "./products/metrobank";
import { PNB_PRODUCTS } from "./products/pnb";
import { RCBC_PRODUCTS } from "./products/rcbc";
import { SECURITYBANK_PRODUCTS } from "./products/securitybank";
import { UNIONBANK_PRODUCTS } from "./products/unionbank";
import { ZED_PRODUCTS } from "./products/zed";
import { CARD_NETWORK_LABELS } from "./vocabulary";
import type {
  CardIssuer,
  CardNetwork,
  CardProduct,
  CardProductVisual,
  HexColor,
} from "./vocabulary";

/** Accounts store only `key`, so catalog edits never need a migration. */
export const CARD_PRODUCTS: readonly CardProduct[] = [
  ...BDO_PRODUCTS,
  ...BPI_PRODUCTS,
  ...METROBANK_PRODUCTS,
  ...UNIONBANK_PRODUCTS,
  ...RCBC_PRODUCTS,
  ...SECURITYBANK_PRODUCTS,
  ...EASTWEST_PRODUCTS,
  ...CHINABANK_PRODUCTS,
  ...PNB_PRODUCTS,
  ...AUB_PRODUCTS,
  ...BANKCOM_PRODUCTS,
  ...EQUICOM_PRODUCTS,
  ...HOMECREDIT_PRODUCTS,
  ...HSBC_PRODUCTS,
  ...LANDBANK_PRODUCTS,
  ...MAYA_PRODUCTS,
  ...MAYBANK_PRODUCTS,
  ...ZED_PRODUCTS,
];

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

const productsByKey = new Map(
  CARD_PRODUCTS.map((product) => [product.key, product])
);
const issuersByKey = new Map(
  CARD_ISSUERS.map((issuer) => [issuer.key, issuer])
);

// Longest first, so "union bank of the philippines" wins over a shorter alias.
const issuerAliases = CARD_ISSUERS.flatMap((issuer) =>
  [issuer.name, issuer.shortName, ...issuer.aliases].map((alias) => ({
    alias: normalizeCardText(alias),
    issuer,
  }))
).toSorted((left, right) => right.alias.length - left.alias.length);

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

export const findCardProduct = (
  key: string | null | undefined
): CardProduct | null => (key ? (productsByKey.get(key) ?? null) : null);

export const findCardIssuer = (key: string): CardIssuer | null =>
  issuersByKey.get(key as CardIssuer["key"]) ?? null;

/** The known issuer an account's free-text institution names, if any. */
export const resolveCardIssuer = (
  institution: string | null | undefined
): CardIssuer | null => {
  const text = normalizeCardText(institution ?? "");
  if (!text) {
    return null;
  }
  const match = issuerAliases.find(
    ({ alias }) => text === alias || text.startsWith(`${alias} `)
  );
  return match?.issuer ?? null;
};

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

export const cardNetworkLabel = (network: CardNetwork): string | null =>
  network === "unknown" ? null : CARD_NETWORK_LABELS[network];

/** "BPI Gold Rewards" — but "Petron BPI", not "BPI Petron BPI". */
export const cardProductName = (product: CardProduct): string => {
  const issuer = findCardIssuer(product.issuerKey);
  if (!issuer) {
    return product.displayName;
  }
  const name = ` ${normalizeCardText(product.displayName)} `;
  return name.includes(` ${normalizeCardText(issuer.shortName)} `)
    ? product.displayName
    : `${issuer.shortName} ${product.displayName}`;
};

export interface CardIdentity {
  cardNetwork?: string | null;
  institution?: string | null;
}

const networkFits = (product: CardProduct, network: CardNetwork | null) =>
  network === null ||
  product.network === "unknown" ||
  product.network === network;

export const isCardProductCompatible = (
  product: CardProduct,
  identity: CardIdentity
): boolean =>
  resolveCardIssuer(identity.institution)?.key === product.issuerKey &&
  networkFits(product, resolveCardNetwork(identity.cardNetwork));

/** An unrecognised issuer narrows nothing: the picker searches everything. */
export const cardProductsFor = (
  identity: CardIdentity
): readonly CardProduct[] => {
  const issuer = resolveCardIssuer(identity.institution);
  const network = resolveCardNetwork(identity.cardNetwork);
  return CARD_PRODUCTS.filter(
    (product) =>
      (!issuer || product.issuerKey === issuer.key) &&
      networkFits(product, network)
  );
};

// A retired `savedKey` stays saveable, or cards holding one could never be
// edited again.
export const cardProductIssue = (
  values: CardIdentity & { cardProductKey?: string | null },
  savedKey?: string | null
): string | null => {
  const key = values.cardProductKey;
  if (!key) {
    return null;
  }
  const product = findCardProduct(key);
  if (!product) {
    return key === savedKey ? null : "Choose a card from the list";
  }

  const issuer = findCardIssuer(product.issuerKey);
  if (resolveCardIssuer(values.institution)?.key !== product.issuerKey) {
    return `${cardProductName(product)} is issued by ${issuer?.name ?? product.issuerKey}`;
  }
  if (!networkFits(product, resolveCardNetwork(values.cardNetwork))) {
    return `${cardProductName(product)} is a ${cardNetworkLabel(product.network)} card`;
  }
  return null;
};

const IGNORED_NAME_TOKENS = new Set([
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
]);

const issuerMentionedIn = (name: string): CardIssuer | null => {
  const text = ` ${normalizeCardText(name)} `;
  return (
    issuerAliases.find(({ alias }) => text.includes(` ${alias} `))?.issuer ??
    null
  );
};

const networkMentionedIn = (name: string): CardNetwork | null => {
  const text = ` ${normalizeCardText(name)} `;
  for (const [alias, network] of NETWORK_ALIASES) {
    if (alias.length > 2 && text.includes(` ${alias} `)) {
      return network;
    }
  }
  return null;
};

// Returns every product tied for best, so no caller ever guesses one of several
// plausible products on the user's behalf.
export const suggestCardProducts = (
  identity: CardIdentity & { name?: string | null }
): readonly CardProduct[] => {
  const name = identity.name ?? "";
  const issuer =
    resolveCardIssuer(identity.institution) ?? issuerMentionedIn(name);
  if (!issuer) {
    return [];
  }
  const network =
    resolveCardNetwork(identity.cardNetwork) ?? networkMentionedIn(name);

  const issuerTokens = new Set([
    ...tokensOf(issuer.name),
    ...tokensOf(issuer.shortName),
  ]);
  const nameTokens = new Set(
    tokensOf(name).filter(
      (token) => !(issuerTokens.has(token) || IGNORED_NAME_TOKENS.has(token))
    )
  );
  if (nameTokens.size === 0) {
    return [];
  }

  const scored = CARD_PRODUCTS.filter(
    (product) =>
      product.issuerKey === issuer.key && networkFits(product, network)
  ).map((product) => {
    const productTokens = new Set(
      [product.displayName, ...(product.aliases ?? [])].flatMap(tokensOf)
    );
    const matched = [...nameTokens].filter((token) =>
      productTokens.has(token)
    ).length;
    // "Rewards" ranks above "Gold Rewards" for a card named "BPI Rewards".
    const unmatched = tokensOf(product.displayName).filter(
      (token) => !(nameTokens.has(token) || IGNORED_NAME_TOKENS.has(token))
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
};
