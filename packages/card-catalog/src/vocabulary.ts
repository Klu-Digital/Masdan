// Presentation only: nothing here may feed balances, statements or reports.

import type { CardCountryCode } from "./countries";

export const CARD_NETWORKS = [
  "visa",
  "mastercard",
  "amex",
  "jcb",
  "unionpay",
  "diners",
  "discover",
  "unknown",
] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

/** What `financial_account.card_network` has always stored per network. */
export const CARD_NETWORK_LABELS: Record<
  Exclude<CardNetwork, "unknown">,
  string
> = {
  amex: "American Express",
  diners: "Diners Club",
  discover: "Discover",
  jcb: "JCB",
  mastercard: "Mastercard",
  unionpay: "UnionPay",
  visa: "Visa",
};

/** Full-field textures a renderer can draw with CSS/SVG. */
export const CARD_PATTERNS = [
  "angular-panels",
  "brushed",
  "color-blocks",
  "crossed-light",
  "diagonal-lines",
  "dot-matrix",
  "fine-lines",
  "halftone",
  "hexagons",
  "pinstripes",
  "pixels",
  "scallops",
  "topographic",
] as const;
export type CardPattern = (typeof CARD_PATTERNS)[number];

/** One focal element per card, from a shared primitive, never artwork. */
export const CARD_MOTIFS = [
  "arc-lines",
  "bolt",
  "chevron",
  "chevron-framed",
  "chevron-stripes",
  "co-brand-stripe",
  "contours",
  "dot-field",
  "facets",
  "facets-left",
  "frame",
  "globe",
  "hex-rings",
  "horizon",
  "medallion",
  "monogram",
  "orbit",
  "oversized-letter",
  "peaks",
  "planet",
  "radial-dots",
  "s-ribbon",
  "side-band",
  "silk",
  "skyline",
  "speed-lines",
  "sunburst",
  "sweep",
  "tiles",
  "travel-seal",
  "wave-ribbon",
  "wing-stripe",
  "wordmark",
] as const;
export type CardMotif = (typeof CARD_MOTIFS)[number];

/** Motifs that draw letters, and so need `visual.monogram`. */
export const LETTERED_MOTIFS: readonly CardMotif[] = [
  "monogram",
  "oversized-letter",
  "wordmark",
];

/** Motifs drawn from `visual.palette`, and so needing two colours or more. */
export const PALETTE_MOTIFS: readonly CardMotif[] = [
  "chevron-stripes",
  "contours",
  "facets",
  "facets-left",
];

export type HexColor = `#${string}`;

export interface CardProductVisual {
  /** A linear gradient, first stop to last, drawn at `angle` degrees. */
  background: {
    angle: number;
    stops: readonly [HexColor, HexColor, ...HexColor[]];
  };
  /** Ink for the card's text: light on dark fields, dark on pale ones. */
  foreground: "light" | "dark";
  accent?: HexColor;
  pattern?: CardPattern;
  motif?: CardMotif;
  /** The letters a lettered motif draws; `\n` breaks a wordmark's lines. */
  monogram?: string;
  /** Up to five extra colours, in the order a multi-colour motif uses them. */
  palette?: readonly HexColor[];
  bankMarkTone?: "light" | "dark" | "brand";
  chipTone?: "silver" | "gold";
  networkPlacement?: "bottom-right" | "top-right";
}

export interface CardIssuer<Key extends string = string> {
  /** `<country>-<bank>`: the prefix every one of its product keys carries. */
  key: Key;
  country: CardCountryCode;
  /** What the account's institution is set to when a product is picked. */
  name: string;
  shortName: string;
  /** Other spellings people type as the institution, in this country. */
  aliases: readonly string[];
  brandColor: HexColor;
}

export interface CardProduct<IssuerKey extends string = string> {
  /** Accounts store it: retire with `status`, never rename. */
  key: string;
  issuerKey: IssuerKey;
  displayName: string;
  aliases?: readonly string[];
  network: CardNetwork;
  /** `legacy`: no longer issued but still held. Absent means current. */
  status?: "current" | "legacy";
  visual: CardProductVisual;
}

/** One country's slice of the catalog, loaded as a unit. */
export interface CountryCards {
  country: CardCountryCode;
  issuers: readonly CardIssuer[];
  products: readonly CardProduct[];
  /** Words in a card's name that never tell its products apart, beyond English's. */
  nameStopWords?: readonly string[];
}
