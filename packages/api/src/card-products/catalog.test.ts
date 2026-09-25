import { describe, expect, it } from "vite-plus/test";

import {
  CARD_PRODUCT_KEY_PATTERN,
  CARD_PRODUCTS,
  cardNetworkLabel,
  cardProductIssue,
  cardProductName,
  cardProductsFor,
  findCardProduct,
  isCardProductCompatible,
  issuerCardVisual,
  resolveCardIssuer,
  resolveCardNetwork,
  suggestCardProducts,
} from "./catalog";
import { CARD_ISSUERS } from "./issuers";
import {
  CARD_MOTIFS,
  CARD_NETWORKS,
  CARD_PATTERNS,
  LETTERED_MOTIFS,
  PALETTE_MOTIFS,
} from "./vocabulary";

const HEX = /^#[0-9a-f]{6}$/u;
// Must match --color-on-tint and --color-on-pale-tint in ui globals.css.
const INK = { dark: "#1d1d1f", light: "#ffffff" } as const;

const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (left: string, right: string): number => {
  const [light, dark] = [luminance(left), luminance(right)].toSorted(
    (a, b) => b - a
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

const namesOf = (products: readonly { key: string }[]) =>
  products.map(({ key }) => key);

describe("card product catalog integrity", () => {
  it("gives every product a unique, stable, issuer-prefixed key", () => {
    const keys = namesOf(CARD_PRODUCTS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const product of CARD_PRODUCTS) {
      expect(product.key).toMatch(CARD_PRODUCT_KEY_PATTERN);
      expect(product.key.startsWith(`${product.issuerKey}-`)).toBe(true);
    }
  });

  it("names each product once per issuer", () => {
    for (const issuer of CARD_ISSUERS) {
      const names = CARD_PRODUCTS.filter(
        (product) => product.issuerKey === issuer.key
      ).map((product) => product.displayName.toLowerCase());
      expect(new Set(names).size, issuer.key).toBe(names.length);
    }
  });

  it("declares a known issuer, display name and network for every product", () => {
    const issuerKeys = new Set(CARD_ISSUERS.map(({ key }) => key));
    for (const product of CARD_PRODUCTS) {
      expect(issuerKeys.has(product.issuerKey), product.key).toBe(true);
      expect(product.displayName.trim(), product.key).not.toBe("");
      expect(CARD_NETWORKS, product.key).toContain(product.network);
      expect(["current", "legacy", undefined]).toContain(product.status);
    }
  });

  it("builds every visual from the shared declarative vocabulary", () => {
    for (const { key, visual } of CARD_PRODUCTS) {
      expect(visual.background.stops.length, key).toBeGreaterThanOrEqual(2);
      for (const stop of visual.background.stops) {
        expect(stop, key).toMatch(HEX);
      }
      expect(visual.background.angle, key).toBeGreaterThanOrEqual(0);
      expect(visual.background.angle, key).toBeLessThan(360);
      if (visual.accent) {
        expect(visual.accent, key).toMatch(HEX);
      }
      if (visual.pattern) {
        expect(CARD_PATTERNS, key).toContain(visual.pattern);
      }
      if (visual.motif) {
        expect(CARD_MOTIFS, key).toContain(visual.motif);
      }
      for (const colour of visual.palette ?? []) {
        expect(colour, key).toMatch(HEX);
      }
      expect(visual.palette?.length ?? 0, key).toBeLessThanOrEqual(5);
      if (visual.motif && PALETTE_MOTIFS.includes(visual.motif)) {
        expect(visual.palette?.length ?? 0, key).toBeGreaterThanOrEqual(2);
      }
      const lettered = visual.motif && LETTERED_MOTIFS.includes(visual.motif);
      expect(Boolean(visual.monogram), key).toBe(Boolean(lettered));
    }
  });

  it("keeps card text legible on every stop of its own field", () => {
    for (const { key, visual } of CARD_PRODUCTS) {
      for (const stop of visual.background.stops) {
        expect(
          contrast(INK[visual.foreground], stop),
          `${key} ${stop}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("covers every issuer in scope with its day-one product families", () => {
    const expected: Record<string, string[]> = {
      aub: ["aub-easy-mastercard"],
      bankcom: ["bankcom-platinum-mastercard"],
      bdo: [
        "bdo-visa-signature",
        "bdo-shopmore-mastercard-purple",
        "bdo-shopmore-mastercard-yellow-green",
        "bdo-shopmore-mastercard-orange",
        "bdo-blue-american-express",
        "bdo-jcb-lucky-cat",
      ],
      bpi: [
        "bpi-signature-wealth-mastercard",
        "bpi-gold-rewards-mastercard",
        "bpi-platinum-rewards-mastercard",
        "bpi-amore-platinum-cashback-visa",
        "bpi-omni",
      ],
      chinabank: [
        "chinabank-landers-executive-visa-signature",
        "chinabank-destinations-world-mastercard",
      ],
      eastwest: ["eastwest-visa-gold", "eastwest-krisflyer-world-mastercard"],
      equicom: ["equicom-classic-visa"],
      homecredit: ["homecredit-home-credit-card"],
      hsbc: ["hsbc-red-platinum-mastercard", "hsbc-live-plus-visa-signature"],
      landbank: ["landbank-classic-mastercard"],
      maya: ["maya-black-visa", "maya-landers-cashback-everywhere-visa"],
      maybank: ["maybank-visa-infinite", "maybank-manchester-united-visa"],
      metrobank: [
        "metrobank-titanium-mastercard",
        "metrobank-hype-mastercard",
        "metrobank-hype-visa",
        "metrobank-icon-world-elite-mastercard",
        "metrobank-vantage-mastercard",
        "metrobank-secured-credit-card",
      ],
      pnb: ["pnb-ze-lo-mastercard", "pnb-diamond-unionpay"],
      rcbc: [
        "rcbc-flex-visa",
        "rcbc-hexagon-club-priority",
        "rcbc-black-card-platinum-mastercard",
      ],
      securitybank: ["securitybank-wave-mastercard"],
      unionbank: [
        "unionbank-u-platinum-visa",
        "unionbank-rewards-platinum-mastercard",
        "unionbank-cebu-pacific-gold-visa",
      ],
      zed: ["zed-titanium-mastercard"],
    };
    expect(CARD_PRODUCTS.length).toBeGreaterThanOrEqual(200);
    for (const [issuerKey, keys] of Object.entries(expected)) {
      for (const key of keys) {
        expect(findCardProduct(key)?.issuerKey, key).toBe(issuerKey);
      }
    }
  });

  it("gives every known bank a legible fallback of its own colours", () => {
    for (const issuer of CARD_ISSUERS) {
      const visual = issuerCardVisual(issuer);
      for (const stop of visual.background.stops) {
        expect(stop, issuer.key).toMatch(HEX);
        expect(
          contrast(INK[visual.foreground], stop),
          issuer.key
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("does not collapse a multi-card lineup to one color", () => {
    for (const issuer of CARD_ISSUERS) {
      const lineup = CARD_PRODUCTS.filter(
        (product) => product.issuerKey === issuer.key
      );
      const looks = new Set(
        lineup.map(({ visual }) =>
          [visual.background.stops[0], visual.accent, visual.motif].join(",")
        )
      );
      expect(looks.size, issuer.key).toBeGreaterThanOrEqual(
        Math.min(lineup.length, 4)
      );
    }
  });
});

describe("issuer and network aliases", () => {
  it.each([
    ["BPI", "bpi"],
    ["Bank of the Philippine Islands", "bpi"],
    ["bank of the philippine islands ", "bpi"],
    ["BDO Unibank, Inc.", "bdo"],
    ["Banco de Oro", "bdo"],
    ["Metropolitan Bank & Trust Company", "metrobank"],
    ["UnionBank of the Philippines", "unionbank"],
    ["Union Bank", "unionbank"],
    ["RCBC Bankard", "rcbc"],
    ["security bank", "securitybank"],
    ["East West Bank", "eastwest"],
    ["China Banking Corporation", "chinabank"],
    ["Philippine National Bank", "pnb"],
    ["ZED", "zed"],
    ["Asia United Bank", "aub"],
    ["Bank of Commerce", "bankcom"],
    ["The Hongkong and Shanghai Banking Corporation", "hsbc"],
    ["Land Bank of the Philippines", "landbank"],
    ["Maya Bank", "maya"],
    ["Maybank Philippines", "maybank"],
    ["HC Consumer Finance Philippines, Inc.", "homecredit"],
    ["Equicom Savings Bank", "equicom"],
    ["Zed Financial PH, Inc.", "zed"],
  ])("resolves %s to %s", (institution, key) => {
    expect(resolveCardIssuer(institution)?.key).toBe(key);
  });

  it("leaves unknown, empty and partial-word institutions unresolved", () => {
    expect(resolveCardIssuer("GCash")).toBeNull();
    expect(resolveCardIssuer("")).toBeNull();
    expect(resolveCardIssuer(null)).toBeNull();
    expect(resolveCardIssuer("BPIX Lending")).toBeNull();
  });

  it("gives every issuer alias to exactly one issuer", () => {
    const owners = new Map<string, string>();
    for (const issuer of CARD_ISSUERS) {
      for (const alias of [issuer.name, issuer.shortName, ...issuer.aliases]) {
        const normalized = alias.toLowerCase();
        expect(owners.get(normalized) ?? issuer.key, alias).toBe(issuer.key);
        owners.set(normalized, issuer.key);
      }
    }
  });

  it("reads the network labels accounts already store", () => {
    expect(resolveCardNetwork("Visa")).toBe("visa");
    expect(resolveCardNetwork("Mastercard")).toBe("mastercard");
    expect(resolveCardNetwork("Master Card")).toBe("mastercard");
    expect(resolveCardNetwork("American Express")).toBe("amex");
    expect(resolveCardNetwork("JCB")).toBe("jcb");
    expect(resolveCardNetwork("UnionPay")).toBe("unionpay");
    expect(resolveCardNetwork("Discover")).toBe("discover");
    expect(resolveCardNetwork("Carte Bleue")).toBe("unknown");
    expect(resolveCardNetwork(null)).toBeNull();
    expect(resolveCardNetwork(" ")).toBeNull();
    expect(cardNetworkLabel("amex")).toBe("American Express");
    expect(cardNetworkLabel("unknown")).toBeNull();
  });
});

describe("issuer and network compatibility", () => {
  it("narrows by issuer, then by network, keeping unpublished-network products", () => {
    const bpi = cardProductsFor({ institution: "BPI" });
    expect(bpi.every((product) => product.issuerKey === "bpi")).toBe(true);

    const bpiVisa = namesOf(
      cardProductsFor({ cardNetwork: "Visa", institution: "BPI" })
    );
    expect(bpiVisa).toContain("bpi-signature-visa");
    expect(bpiVisa).toContain("bpi-omni");
    expect(bpiVisa).not.toContain("bpi-gold-rewards-mastercard");
  });

  it("searches the whole catalog when the issuer is unknown", () => {
    expect(cardProductsFor({ institution: "Some Lender" })).toHaveLength(
      CARD_PRODUCTS.length
    );
  });

  it("accepts a product only with its own issuer and network", () => {
    const gold = findCardProduct("bpi-gold-rewards-mastercard");
    if (!gold) {
      throw new Error("missing product");
    }
    expect(
      isCardProductCompatible(gold, {
        cardNetwork: "Mastercard",
        institution: "Bank of the Philippine Islands",
      })
    ).toBe(true);
    expect(isCardProductCompatible(gold, { institution: "BPI" })).toBe(true);
    expect(
      isCardProductCompatible(gold, { cardNetwork: "Visa", institution: "BPI" })
    ).toBe(false);
    expect(
      isCardProductCompatible(gold, {
        cardNetwork: "Mastercard",
        institution: "BDO",
      })
    ).toBe(false);
    expect(isCardProductCompatible(gold, { institution: null })).toBe(false);
  });

  it("explains an invalid combination and allows a valid or empty one", () => {
    expect(cardProductIssue({ cardProductKey: null })).toBeNull();
    expect(
      cardProductIssue({
        cardNetwork: "Mastercard",
        cardProductKey: "bpi-gold-rewards-mastercard",
        institution: "BPI",
      })
    ).toBeNull();
    expect(
      cardProductIssue({
        cardNetwork: "Mastercard",
        cardProductKey: "bpi-gold-rewards-mastercard",
        institution: "BDO",
      })
    ).toBe("BPI Gold Rewards is issued by Bank of the Philippine Islands");
    expect(
      cardProductIssue({
        cardNetwork: "Visa",
        cardProductKey: "bpi-gold-rewards-mastercard",
        institution: "BPI",
      })
    ).toBe("BPI Gold Rewards is a Mastercard card");
    expect(
      cardProductIssue({
        cardNetwork: "Discover",
        cardProductKey: "bpi-free-plus",
        institution: "BPI",
      })
    ).toBeNull();
  });
});

describe("fallback for unknown and retired products", () => {
  it("finds nothing for an unknown key rather than throwing", () => {
    expect(findCardProduct("bpi-retired-in-2030")).toBeNull();
    expect(findCardProduct(null)).toBeNull();
    expect(findCardProduct("")).toBeNull();
  });

  it("rejects a new unknown key but keeps one the account already stores", () => {
    const values = {
      cardNetwork: "Visa",
      cardProductKey: "bpi-retired-in-2030",
      institution: "BPI",
    };
    expect(cardProductIssue(values)).toBe("Choose a card from the list");
    expect(cardProductIssue(values, "bpi-retired-in-2030")).toBeNull();
  });

  it("keeps legacy products selectable", () => {
    expect(findCardProduct("bpi-amore-platinum-cashback-visa")?.status).toBe(
      "legacy"
    );
    expect(
      namesOf(cardProductsFor({ cardNetwork: "Visa", institution: "BPI" }))
    ).toContain("bpi-amore-platinum-cashback-visa");
  });
});

describe("product names and suggestions", () => {
  it("prefixes the issuer unless the product name already carries it", () => {
    const gold = findCardProduct("bpi-gold-rewards-mastercard");
    const petron = findCardProduct("bpi-petron-mastercard");
    expect(gold && cardProductName(gold)).toBe("BPI Gold Rewards");
    expect(petron && cardProductName(petron)).toBe("Petron BPI");
  });

  it("offers the single match for a distinctive name", () => {
    expect(
      namesOf(
        suggestCardProducts({
          cardNetwork: "Mastercard",
          institution: "BDO",
          name: "BDO ShopMore Orange",
        })
      )
    ).toEqual(["bdo-shopmore-mastercard-orange"]);
  });

  it("reads the issuer and network from the name when the fields are empty", () => {
    expect(
      namesOf(suggestCardProducts({ name: "Metrobank Titanium" }))
    ).toEqual(["metrobank-titanium-mastercard"]);
    expect(
      namesOf(suggestCardProducts({ name: "Hype Visa Metrobank" }))
    ).toEqual(["metrobank-hype-visa"]);
  });

  it("returns every plausible product, closest first, instead of guessing one", () => {
    const rewards = namesOf(
      suggestCardProducts({ institution: "BPI", name: "BPI Rewards" })
    );
    expect(rewards[0]).toBe("bpi-rewards-mastercard");
    expect(rewards).toContain("bpi-gold-rewards-mastercard");
    expect(rewards).toContain("bpi-platinum-rewards-mastercard");

    expect(
      namesOf(suggestCardProducts({ institution: "Metrobank", name: "Hype" }))
    ).toEqual(["metrobank-hype-mastercard", "metrobank-hype-visa"]);
  });

  it("suggests nothing without an issuer or a distinctive word", () => {
    expect(suggestCardProducts({ name: "Gold card" })).toEqual([]);
    expect(
      suggestCardProducts({ institution: "BPI", name: "BPI Visa" })
    ).toEqual([]);
    expect(
      suggestCardProducts({ institution: "BPI", name: "Groceries card" })
    ).toEqual([]);
  });
});

describe("catalog coverage by name", () => {
  it.each([
    [
      "RCBC",
      "Black Card Platinum Mastercard",
      "rcbc-black-card-platinum-mastercard",
    ],
    ["EastWest", "Platinum Visa", "eastwest-visa-platinum"],
    ["Metrobank", "Rewards Plus", "metrobank-rewards-plus-visa"],
    ["BDO", "Diners Club Premiere", "bdo-diners-club-premiere"],
    ["UnionBank", "Lazada", "unionbank-lazada-credit-card"],
    ["PNB", "World Elite", "pnb-world-elite-mastercard"],
  ])("finds %s %s", (institution, name, key) => {
    expect(namesOf(suggestCardProducts({ institution, name }))).toContain(key);
  });

  it("puts Hexagon Club cards on Mastercard", () => {
    expect(findCardProduct("rcbc-hexagon-club-priority")?.network).toBe(
      "mastercard"
    );
    expect(findCardProduct("rcbc-hexagon-club-privilege")?.network).toBe(
      "mastercard"
    );
  });
});
