import { cardCatalog } from "@masdan/card-catalog/all";
import { CARD_MOTIFS, CARD_PATTERNS } from "@masdan/card-catalog/vocabulary";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { CreditCardVisual } from "@/components/finance/credit-card-visual";

import type { CardIdentity } from "../card-art";
import { AccountCard } from "./account-card";

const account: CardIdentity = {
  cardLastFour: "4242",
  cardNetwork: "Mastercard",
  cardProductKey: "ph-bpi-gold-rewards-mastercard",
  color: null,
  institution: "BPI",
  name: "Groceries card",
};

const face = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-slot='credit-card-visual']");

const artLayer = (container: HTMLElement) =>
  face(container)?.querySelector("svg");

const cardFor = (key: string) => {
  const product = cardCatalog.findProduct(key);
  if (!product) {
    throw new Error(`${key} is not in the catalog`);
  }
  const { container } = render(
    <AccountCard
      account={{
        ...account,
        cardNetwork: product.network,
        cardProductKey: key,
        institution: cardCatalog.findIssuer(product.issuerKey)?.name ?? null,
      }}
    />
  );
  const card = face(container);
  if (!card) {
    throw new Error(`${key} rendered no card`);
  }
  return card;
};

// What tells two cards apart without comparing pixels.
const lookOf = (card: HTMLElement) =>
  [
    card.dataset.motif,
    card.dataset.pattern,
    card.dataset.ink,
    card.style.getPropertyValue("--card-face-field"),
  ].join("|");

describe("AccountCard", () => {
  it("prints the bank, product, masked digits and network mark", () => {
    const { container } = render(<AccountCard account={account} />);
    expect(face(container)).toHaveAttribute("aria-hidden", "true");
    expect(face(container)).toHaveTextContent("BPI");
    expect(face(container)).toHaveTextContent("Gold Rewards");
    expect(face(container)).toHaveTextContent("•••• 4242");
    expect(
      container.querySelector("[data-slot='network-mark']")
    ).toHaveAttribute("aria-label", "Mastercard");
  });

  it("never prints more than the last four digits", () => {
    const { container } = render(
      <AccountCard account={account} size="compact" />
    );
    expect(face(container)?.textContent?.match(/\d/gu)?.join("")).toBe("4242");
  });

  it("draws a card with no bank, network or digits without breaking", () => {
    const { container } = render(
      <AccountCard
        account={{
          ...account,
          cardLastFour: null,
          cardNetwork: null,
          cardProductKey: "gone-from-the-catalog",
          institution: null,
        }}
      />
    );
    expect(face(container)).toHaveTextContent("Groceries card");
    expect(face(container)).toHaveTextContent("•••• ••••");
    expect(container.querySelector("[data-slot='network-mark']")).toBeNull();
    expect(face(container)?.dataset).toMatchObject({
      identity: "generic",
      motif: "rings",
    });
  });

  it("falls back to the network's name when it has no mark", () => {
    const { container } = render(
      <AccountCard
        account={{
          ...account,
          cardNetwork: "Carte Bleue",
          cardProductKey: null,
        }}
      />
    );
    expect(face(container)).toHaveTextContent("Carte Bleue");
  });

  it("says whose look it wears: the product's, the bank's or neither", () => {
    const identity = (overrides: Partial<typeof account>) =>
      face(
        render(<AccountCard account={{ ...account, ...overrides }} />).container
      )?.dataset.identity;
    expect(identity({})).toBe("product");
    expect(identity({ cardProductKey: null })).toBe("issuer");
    expect(identity({ cardProductKey: "retired-card" })).toBe("issuer");
    expect(identity({ cardProductKey: null, institution: "Local Coop" })).toBe(
      "generic"
    );
  });

  it("gives a bank's card without a product the bank's name and the account's", () => {
    const { container } = render(
      <AccountCard account={{ ...account, cardProductKey: null }} />
    );
    expect(face(container)).toHaveTextContent("BPI");
    expect(face(container)).toHaveTextContent("Groceries card");
    expect(face(container)?.dataset.motif).toBeUndefined();
  });
});

describe("AccountCard sizes", () => {
  it("lays the full card out with a chip and the masked number", () => {
    const { container } = render(<AccountCard account={account} />);
    expect(face(container)?.dataset.size).toBe("full");
    expect(face(container)?.querySelector(".from-chip-gold")).not.toBeNull();
    expect(face(container)).toHaveTextContent("•••• 4242");
  });

  it("keeps the compact card to bank, last four, name and network", () => {
    const { container } = render(
      <AccountCard account={account} size="compact" />
    );
    expect(face(container)?.querySelector("[class*='chip']")).toBeNull();
    expect(face(container)).toHaveTextContent("BPI");
    expect(face(container)).toHaveTextContent("•• 4242");
    expect(face(container)).toHaveTextContent("Gold Rewards");
    expect(
      container.querySelector("[data-slot='network-mark']")
    ).not.toBeNull();
  });

  it("shrinks to a swatch with only the network mark", () => {
    const { container } = render(
      <AccountCard account={account} size="thumb" />
    );
    expect(face(container)?.textContent).toBe("");
    expect(
      container.querySelector("[data-slot='network-mark']")
    ).not.toBeNull();
  });
});

describe("catalog cards", () => {
  it.each([
    ["ph-bpi-gold-rewards-mastercard", { motif: "radial-dots" }],
    [
      "ph-metrobank-titanium-mastercard",
      { ink: "light", pattern: "dot-matrix" },
    ],
    [
      "ph-unionbank-u-platinum-visa",
      { ink: "light", motif: "oversized-letter" },
    ],
    ["ph-rcbc-flex-visa", { motif: "skyline" }],
    [
      "ph-securitybank-wave-mastercard",
      { motif: "sweep", pattern: "topographic" },
    ],
    ["ph-eastwest-visa-platinum", { pattern: "angular-panels" }],
    ["ph-pnb-ze-lo-mastercard", { ink: "dark", motif: "sweep" }],
  ])("draws %s from its catalog look", (key, look) => {
    const card = cardFor(key);
    expect(card.dataset).toMatchObject({ identity: "product", ...look });
    expect(card.querySelector("svg")?.childElementCount).toBeGreaterThan(0);
  });

  it("keeps the reference cards visibly distinct from one another", () => {
    const looks = [
      "ph-bpi-gold-rewards-mastercard",
      "ph-metrobank-titanium-mastercard",
      "ph-unionbank-u-platinum-visa",
      "ph-rcbc-flex-visa",
      "ph-securitybank-wave-mastercard",
      "ph-eastwest-visa-platinum",
      "ph-pnb-ze-lo-mastercard",
    ].map((key) => lookOf(cardFor(key)));
    expect(new Set(looks).size).toBe(looks.length);
  });

  it("runs Ze-Lo's ribbon from red to blue", () => {
    const stops = cardFor("ph-pnb-ze-lo-mastercard").querySelectorAll(
      "linearGradient stop"
    );
    expect(stops).toHaveLength(3);
  });

  it("puts U Platinum's letter on a near-black card", () => {
    const card = cardFor("ph-unionbank-u-platinum-visa");
    expect(card.querySelector("text")).toHaveTextContent("U");
    expect(card.style.getPropertyValue("--card-face-field")).toMatch(
      /#1[0-9a-f]{5}/u
    );
  });
});

describe("motif library", () => {
  const art = {
    accent: "#c9a24a",
    angle: 135,
    ink: "light",
    monogram: "UB",
    palette: ["#e0262f", "#1f4fb8", "#2bb6c9"],
    stops: ["#1c2c55", "#0f1936"],
  } as const;

  it.each(CARD_MOTIFS)("draws the %s motif", (motif) => {
    const { container } = render(
      <CreditCardVisual art={{ ...art, motif }} label="Card" />
    );
    expect(artLayer(container)?.childElementCount).toBeGreaterThan(0);
  });

  it.each(CARD_PATTERNS)("draws the %s pattern", (pattern) => {
    const { container } = render(
      <CreditCardVisual art={{ ...art, pattern }} label="Card" />
    );
    expect(
      artLayer(container)?.querySelector("g")?.childElementCount
    ).toBeGreaterThan(0);
  });
});
