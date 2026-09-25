import type { CardProduct } from "../vocabulary";

// Reference: https://www.zed.co/
export const ZED_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Zed", "Zed Titanium", "Zed Titanium Mastercard"],
    displayName: "Zed Card",
    issuerKey: "zed",
    key: "zed-titanium-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#f2ee2e", "#e3dc12"],
      },
      foreground: "dark",
      motif: "bolt",
    },
  },
];
