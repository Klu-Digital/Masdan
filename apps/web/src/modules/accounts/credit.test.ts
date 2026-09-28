import { cardCatalog } from "@masdan/card-catalog/all";
import { describe, expect, it } from "vite-plus/test";

import { cardProductLabel } from "./credit";

describe("cardProductLabel", () => {
  it("names a catalog product with its issuer", () => {
    expect(
      cardProductLabel(cardCatalog, "ph-bpi-gold-rewards-mastercard")
    ).toBe("BPI Gold Rewards");
  });

  it("says nothing for a card with no product", () => {
    expect(cardProductLabel(cardCatalog, null)).toBeNull();
  });

  it("falls back gracefully for a retired or unknown key", () => {
    expect(cardProductLabel(cardCatalog, "ph-bpi-retired-in-2030")).toBe(
      "No longer in the catalog"
    );
  });
});
