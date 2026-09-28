import { describe, expect, it } from "vite-plus/test";

import { cardCatalog } from "./all";
import {
  CARD_PRODUCT_KEY_PATTERN,
  cardNetworkLabel,
  createCardCatalog,
  issuerCardVisual,
  resolveCardNetwork,
} from "./catalog";
import type { CardIdentity } from "./catalog";
import {
  CARD_COUNTRIES,
  cardCountriesFor,
  cardCountryOfKey,
  loadCardCountry,
} from "./countries";
import {
  CARD_MOTIFS,
  CARD_NETWORKS,
  CARD_PATTERNS,
  LETTERED_MOTIFS,
  PALETTE_MOTIFS,
} from "./vocabulary";
import type { CountryCards } from "./vocabulary";

const CARD_PRODUCTS = cardCatalog.products;
const CARD_ISSUERS = cardCatalog.issuers;
const PH = ["ph"] as const;
const findCardProduct = cardCatalog.findProduct;
const cardProductIssue = cardCatalog.productIssue;
const cardProductName = cardCatalog.productName;
const isCardProductCompatible = cardCatalog.isProductCompatible;
const resolveCardIssuer = (institution: string | null) =>
  cardCatalog.resolveIssuer(institution, PH);
const cardProductsFor = (identity: CardIdentity) =>
  cardCatalog.productsFor(identity, PH);
const suggestCardProducts = (
  identity: CardIdentity & { name?: string | null }
) => cardCatalog.suggest(identity, PH);

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

describe("countries", () => {
  it("loads every registered country, and only those, into the full catalog", () => {
    expect(cardCatalog.countries).toEqual(
      CARD_COUNTRIES.map(({ code }) => code)
    );
  });

  it("lazy-loads the same cards the full catalog holds", async () => {
    for (const { code } of CARD_COUNTRIES) {
      const cards = await loadCardCountry(code);
      expect(cards.country).toBe(code);
      expect(cards.products.map(({ key }) => key)).toEqual(
        cardCatalog.products
          .filter((product) => cardCountryOfKey(product.key) === code)
          .map(({ key }) => key)
      );
    }
  });

  it("prefixes every issuer key with its own country", () => {
    const codes = CARD_COUNTRIES.map(({ code }) => code);
    for (const issuer of CARD_ISSUERS) {
      expect(codes, issuer.key).toContain(issuer.country);
      expect(issuer.key.startsWith(`${issuer.country}-`), issuer.key).toBe(
        true
      );
      expect(issuer.key).toMatch(CARD_PRODUCT_KEY_PATTERN);
    }
  });

  it("reads a key's country from its prefix", () => {
    expect(cardCountryOfKey("ph-bpi-gold-rewards-mastercard")).toBe("ph");
    expect(cardCountryOfKey("bpi-gold-rewards-mastercard")).toBeNull();
    expect(cardCountryOfKey("")).toBeNull();
    expect(cardCountryOfKey(null)).toBeNull();
  });

  it("maps currencies to countries, falling back to every loaded one", () => {
    expect(cardCountriesFor(["php"])).toEqual(["ph"]);
    expect(cardCountriesFor(["USD", null, "PHP", "PHP"])).toEqual(["ph"]);
    expect(cardCountriesFor(["USD"])).toEqual([]);
    expect(cardCatalog.scope(["PHP"])).toEqual(["ph"]);
    expect(cardCatalog.scope(["USD"])).toEqual(cardCatalog.countries);
    expect(createCardCatalog([]).scope(["PHP"])).toEqual([]);
  });

  it("resolves the same bank name differently per country", async () => {
    // No second country ships yet; this one exists only for the test.
    const sg = "sg" as string as CountryCards["country"];
    const citi: CountryCards = {
      country: sg,
      issuers: [
        {
          aliases: ["Citi", "Citibank"],
          brandColor: "#003b70",
          country: sg,
          key: "sg-citi",
          name: "Citibank Singapore",
          shortName: "Citi",
        },
      ],
      products: [],
    };
    const catalog = createCardCatalog([await loadCardCountry("ph"), citi]);
    expect(catalog.resolveIssuer("Citi", ["ph"])?.key).toBe("ph-unionbank");
    expect(catalog.resolveIssuer("Citi", [sg])?.key).toBe("sg-citi");
    expect(catalog.resolveIssuer("Citi", [sg, "ph"])?.key).toBe("sg-citi");
    expect(catalog.resolveIssuer("BPI", [sg])).toBeNull();
    expect(catalog.issuersIn([sg]).map(({ key }) => key)).toEqual(["sg-citi"]);
    // A product's own country decides, whatever the caller's scope.
    expect(
      catalog.productIssue({
        cardProductKey: "ph-unionbank-rewards-platinum-mastercard",
        institution: "Citi",
      })
    ).toBeNull();
  });
});

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
      "ph-aub": ["ph-aub-easy-mastercard"],
      "ph-bankcom": ["ph-bankcom-platinum-mastercard"],
      "ph-bdo": [
        "ph-bdo-visa-signature",
        "ph-bdo-shopmore-mastercard-purple",
        "ph-bdo-shopmore-mastercard-yellow-green",
        "ph-bdo-shopmore-mastercard-orange",
        "ph-bdo-blue-american-express",
        "ph-bdo-jcb-lucky-cat",
      ],
      "ph-bpi": [
        "ph-bpi-signature-wealth-mastercard",
        "ph-bpi-gold-rewards-mastercard",
        "ph-bpi-platinum-rewards-mastercard",
        "ph-bpi-amore-platinum-cashback-visa",
        "ph-bpi-omni",
      ],
      "ph-chinabank": [
        "ph-chinabank-landers-executive-visa-signature",
        "ph-chinabank-destinations-world-mastercard",
      ],
      "ph-eastwest": [
        "ph-eastwest-visa-gold",
        "ph-eastwest-krisflyer-world-mastercard",
      ],
      "ph-equicom": ["ph-equicom-classic-visa"],
      "ph-homecredit": ["ph-homecredit-home-credit-card"],
      "ph-hsbc": [
        "ph-hsbc-red-platinum-mastercard",
        "ph-hsbc-live-plus-visa-signature",
      ],
      "ph-landbank": ["ph-landbank-classic-mastercard"],
      "ph-maya": [
        "ph-maya-black-visa",
        "ph-maya-landers-cashback-everywhere-visa",
      ],
      "ph-maybank": [
        "ph-maybank-visa-infinite",
        "ph-maybank-manchester-united-visa",
      ],
      "ph-metrobank": [
        "ph-metrobank-titanium-mastercard",
        "ph-metrobank-hype-mastercard",
        "ph-metrobank-hype-visa",
        "ph-metrobank-icon-world-elite-mastercard",
        "ph-metrobank-vantage-mastercard",
        "ph-metrobank-secured-credit-card",
      ],
      "ph-pnb": ["ph-pnb-ze-lo-mastercard", "ph-pnb-diamond-unionpay"],
      "ph-rcbc": [
        "ph-rcbc-flex-visa",
        "ph-rcbc-hexagon-club-priority",
        "ph-rcbc-black-card-platinum-mastercard",
      ],
      "ph-securitybank": ["ph-securitybank-wave-mastercard"],
      "ph-unionbank": [
        "ph-unionbank-u-platinum-visa",
        "ph-unionbank-rewards-platinum-mastercard",
        "ph-unionbank-cebu-pacific-gold-visa",
      ],
      "ph-zed": ["ph-zed-titanium-mastercard"],
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
    ["BPI", "ph-bpi"],
    ["Bank of the Philippine Islands", "ph-bpi"],
    ["bank of the philippine islands ", "ph-bpi"],
    ["BDO Unibank, Inc.", "ph-bdo"],
    ["Banco de Oro", "ph-bdo"],
    ["Metropolitan Bank & Trust Company", "ph-metrobank"],
    ["UnionBank of the Philippines", "ph-unionbank"],
    ["Union Bank", "ph-unionbank"],
    ["RCBC Bankard", "ph-rcbc"],
    ["security bank", "ph-securitybank"],
    ["East West Bank", "ph-eastwest"],
    ["China Banking Corporation", "ph-chinabank"],
    ["Philippine National Bank", "ph-pnb"],
    ["ZED", "ph-zed"],
    ["Asia United Bank", "ph-aub"],
    ["Bank of Commerce", "ph-bankcom"],
    ["The Hongkong and Shanghai Banking Corporation", "ph-hsbc"],
    ["Land Bank of the Philippines", "ph-landbank"],
    ["Maya Bank", "ph-maya"],
    ["Maybank Philippines", "ph-maybank"],
    ["HC Consumer Finance Philippines, Inc.", "ph-homecredit"],
    ["Equicom Savings Bank", "ph-equicom"],
    ["Zed Financial PH, Inc.", "ph-zed"],
  ])("resolves %s to %s", (institution, key) => {
    expect(resolveCardIssuer(institution)?.key).toBe(key);
  });

  it("leaves unknown, empty and partial-word institutions unresolved", () => {
    expect(resolveCardIssuer("GCash")).toBeNull();
    expect(resolveCardIssuer("")).toBeNull();
    expect(resolveCardIssuer(null)).toBeNull();
    expect(resolveCardIssuer("BPIX Lending")).toBeNull();
  });

  it("gives every issuer alias to exactly one issuer in its country", () => {
    const owners = new Map<string, string>();
    for (const issuer of CARD_ISSUERS) {
      for (const alias of [issuer.name, issuer.shortName, ...issuer.aliases]) {
        const normalized = `${issuer.country}:${alias.toLowerCase()}`;
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
    expect(bpi.every((product) => product.issuerKey === "ph-bpi")).toBe(true);

    const bpiVisa = namesOf(
      cardProductsFor({ cardNetwork: "Visa", institution: "BPI" })
    );
    expect(bpiVisa).toContain("ph-bpi-signature-visa");
    expect(bpiVisa).toContain("ph-bpi-omni");
    expect(bpiVisa).not.toContain("ph-bpi-gold-rewards-mastercard");
  });

  it("searches the whole catalog when the issuer is unknown", () => {
    expect(cardProductsFor({ institution: "Some Lender" })).toHaveLength(
      CARD_PRODUCTS.length
    );
  });

  it("accepts a product only with its own issuer and network", () => {
    const gold = findCardProduct("ph-bpi-gold-rewards-mastercard");
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
        cardProductKey: "ph-bpi-gold-rewards-mastercard",
        institution: "BPI",
      })
    ).toBeNull();
    expect(
      cardProductIssue({
        cardNetwork: "Mastercard",
        cardProductKey: "ph-bpi-gold-rewards-mastercard",
        institution: "BDO",
      })
    ).toBe("BPI Gold Rewards is issued by Bank of the Philippine Islands");
    expect(
      cardProductIssue({
        cardNetwork: "Visa",
        cardProductKey: "ph-bpi-gold-rewards-mastercard",
        institution: "BPI",
      })
    ).toBe("BPI Gold Rewards is a Mastercard card");
    expect(
      cardProductIssue({
        cardNetwork: "Discover",
        cardProductKey: "ph-bpi-free-plus",
        institution: "BPI",
      })
    ).toBeNull();
  });
});

describe("fallback for unknown and retired products", () => {
  it("finds nothing for an unknown key rather than throwing", () => {
    expect(findCardProduct("ph-bpi-retired-in-2030")).toBeNull();
    expect(findCardProduct(null)).toBeNull();
    expect(findCardProduct("")).toBeNull();
  });

  it("rejects a new unknown key but keeps one the account already stores", () => {
    const values = {
      cardNetwork: "Visa",
      cardProductKey: "ph-bpi-retired-in-2030",
      institution: "BPI",
    };
    expect(cardProductIssue(values)).toBe("Choose a card from the list");
    expect(cardProductIssue(values, "ph-bpi-retired-in-2030")).toBeNull();
  });

  it("keeps legacy products selectable", () => {
    expect(findCardProduct("ph-bpi-amore-platinum-cashback-visa")?.status).toBe(
      "legacy"
    );
    expect(
      namesOf(cardProductsFor({ cardNetwork: "Visa", institution: "BPI" }))
    ).toContain("ph-bpi-amore-platinum-cashback-visa");
  });
});

describe("product names and suggestions", () => {
  it("prefixes the issuer unless the product name already carries it", () => {
    const gold = findCardProduct("ph-bpi-gold-rewards-mastercard");
    const petron = findCardProduct("ph-bpi-petron-mastercard");
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
    ).toEqual(["ph-bdo-shopmore-mastercard-orange"]);
  });

  it("reads the issuer and network from the name when the fields are empty", () => {
    expect(
      namesOf(suggestCardProducts({ name: "Metrobank Titanium" }))
    ).toEqual(["ph-metrobank-titanium-mastercard"]);
    expect(
      namesOf(suggestCardProducts({ name: "Hype Visa Metrobank" }))
    ).toEqual(["ph-metrobank-hype-visa"]);
  });

  it("returns every plausible product, closest first, instead of guessing one", () => {
    const rewards = namesOf(
      suggestCardProducts({ institution: "BPI", name: "BPI Rewards" })
    );
    expect(rewards[0]).toBe("ph-bpi-rewards-mastercard");
    expect(rewards).toContain("ph-bpi-gold-rewards-mastercard");
    expect(rewards).toContain("ph-bpi-platinum-rewards-mastercard");

    expect(
      namesOf(suggestCardProducts({ institution: "Metrobank", name: "Hype" }))
    ).toEqual(["ph-metrobank-hype-mastercard", "ph-metrobank-hype-visa"]);
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
      "ph-rcbc-black-card-platinum-mastercard",
    ],
    ["EastWest", "Platinum Visa", "ph-eastwest-visa-platinum"],
    ["Metrobank", "Rewards Plus", "ph-metrobank-rewards-plus-visa"],
    ["BDO", "Diners Club Premiere", "ph-bdo-diners-club-premiere"],
    ["UnionBank", "Lazada", "ph-unionbank-lazada-credit-card"],
    ["PNB", "World Elite", "ph-pnb-world-elite-mastercard"],
  ])("finds %s %s", (institution, name, key) => {
    expect(namesOf(suggestCardProducts({ institution, name }))).toContain(key);
  });

  it("puts Hexagon Club cards on Mastercard", () => {
    expect(findCardProduct("ph-rcbc-hexagon-club-priority")?.network).toBe(
      "mastercard"
    );
    expect(findCardProduct("ph-rcbc-hexagon-club-privilege")?.network).toBe(
      "mastercard"
    );
  });
});
