import { cardCatalog } from "@masdan/card-catalog/all";
import { describe, expect, it } from "vite-plus/test";

import { cardPresentation as present } from "./card-art";
import type { CardIdentity } from "./card-art";

const cardPresentation = (card: CardIdentity) => present(cardCatalog, card);

const card = {
  cardLastFour: "4242",
  cardNetwork: "Mastercard",
  cardProductKey: null,
  color: null,
  institution: "BPI",
  name: "Everyday card",
};

describe("cardPresentation", () => {
  it("draws a catalog product with its own art and network mark", () => {
    const shown = cardPresentation({
      ...card,
      cardProductKey: "ph-bpi-gold-rewards-mastercard",
    });
    expect(shown).toMatchObject({
      issuer: "BPI",
      label: "Gold Rewards",
      lastFour: "4242",
      network: "mastercard",
    });
    expect(shown.art?.motif).toBe("radial-dots");
  });

  it("falls back to the bank's colours, not a product, when none is chosen", () => {
    const shown = cardPresentation(card);
    expect(shown.label).toBe("Everyday card");
    expect(shown.issuer).toBe("BPI");
    expect(shown.art?.motif).toBeUndefined();
    expect(shown.art?.stops).toHaveLength(2);
  });

  it("treats a retired product key like no product", () => {
    expect(
      cardPresentation({ ...card, cardProductKey: "ph-bpi-retired-in-2030" })
    ).toEqual(cardPresentation(card));
  });

  it("uses the account tint for an unknown bank and text for an unknown network", () => {
    const shown = cardPresentation({
      ...card,
      cardNetwork: "Carte Bleue",
      color: "emerald",
      institution: "Local Coop",
    });
    expect(shown).toMatchObject({
      art: null,
      issuer: "Local Coop",
      network: null,
      networkLabel: "Carte Bleue",
      tint: "emerald",
    });
  });

  it("survives a card with no bank, network or digits", () => {
    expect(
      cardPresentation({
        ...card,
        cardLastFour: null,
        cardNetwork: null,
        institution: null,
      })
    ).toMatchObject({ art: null, issuer: null, lastFour: null, network: null });
  });
});
