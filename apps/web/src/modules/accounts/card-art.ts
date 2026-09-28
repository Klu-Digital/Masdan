import {
  issuerCardVisual,
  resolveCardNetwork,
} from "@masdan/card-catalog/catalog";
import type { CardCatalog } from "@masdan/card-catalog/catalog";
import type {
  CardNetwork,
  CardProductVisual,
} from "@masdan/card-catalog/vocabulary";
import type { CardArt } from "@masdan/ui/components/card-art/canvas";
import type { NetworkMarkKind } from "@masdan/ui/components/network-mark";

import { accountKind } from "./kinds";

export interface CardIdentity {
  cardLastFour: string | null;
  cardNetwork: string | null;
  cardProductKey: string | null;
  color: string | null;
  /** Which country's banks the institution is read against. */
  currencyCode?: string | null;
  institution: string | null;
  name: string;
}

export interface CardPresentation {
  art: CardArt | null;
  identity: "product" | "issuer" | "generic";
  issuer: string | null;
  label: string;
  lastFour: string | null;
  network: NetworkMarkKind | null;
  networkLabel: string | null;
  tint: string;
}

const artOf = (visual: CardProductVisual): CardArt => ({
  accent: visual.accent,
  angle: visual.background.angle,
  chipTone: visual.chipTone,
  ink: visual.foreground,
  monogram: visual.monogram,
  motif: visual.motif,
  palette: visual.palette,
  pattern: visual.pattern,
  stops: visual.background.stops,
});

export const networkMarkOf = (
  network: CardNetwork | null
): NetworkMarkKind | null =>
  network === null || network === "unknown" ? null : network;

/**
 * What a card account looks like: its product's art, else its bank's colours,
 * else the account's own tint. An unknown or retired product key falls
 * through to the bank, never to a broken card.
 */
export const cardPresentation = (
  catalog: CardCatalog,
  card: CardIdentity
): CardPresentation => {
  const product = catalog.findProduct(card.cardProductKey);
  const issuer = product
    ? catalog.findIssuer(product.issuerKey)
    : catalog.resolveIssuer(
        card.institution,
        catalog.scope([card.currencyCode])
      );
  const network =
    product && product.network !== "unknown"
      ? product.network
      : resolveCardNetwork(card.cardNetwork);

  let art: CardArt | null = null;
  let identity: CardPresentation["identity"] = "generic";
  if (product) {
    art = artOf(product.visual);
    identity = "product";
  } else if (issuer) {
    art = artOf(issuerCardVisual(issuer));
    identity = "issuer";
  }

  return {
    art,
    identity,
    issuer: issuer?.shortName ?? (card.institution?.trim() || null),
    label: product?.displayName ?? card.name,
    lastFour: card.cardLastFour,
    network: networkMarkOf(network),
    networkLabel: card.cardNetwork,
    tint: card.color ?? accountKind("credit_card").color,
  };
};
