import type { CardProduct } from "../vocabulary";

// Reference: https://www.homecredit.ph/help/credit-card
export const HOMECREDIT_PRODUCTS: readonly CardProduct[] = [
  // Home Credit does not publish the network.
  {
    aliases: ["Home Credit Credit Card"],
    displayName: "Home Credit Card",
    issuerKey: "homecredit",
    key: "homecredit-home-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#e11931", "#a8101f"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
];
