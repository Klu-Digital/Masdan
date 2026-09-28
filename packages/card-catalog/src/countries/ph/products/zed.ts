import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.zed.co/
export const ZED_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Zed", "Zed Titanium", "Zed Titanium Mastercard"],
    displayName: "Zed Card",
    issuerKey: "ph-zed",
    key: "ph-zed-titanium-mastercard",
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
