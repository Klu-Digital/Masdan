import { describe, expect, it } from "vite-plus/test";

import { cardProductLabel } from "./credit";

describe("cardProductLabel", () => {
  it("names a catalog product with its issuer", () => {
    expect(cardProductLabel("bpi-gold-rewards-mastercard")).toBe(
      "BPI Gold Rewards"
    );
  });

  it("says nothing for a card with no product", () => {
    expect(cardProductLabel(null)).toBeNull();
  });

  it("falls back gracefully for a retired or unknown key", () => {
    expect(cardProductLabel("bpi-retired-in-2030")).toBe(
      "No longer in the catalog"
    );
  });
});
