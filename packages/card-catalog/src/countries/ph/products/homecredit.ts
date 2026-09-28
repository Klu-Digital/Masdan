import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.homecredit.ph/help/credit-card
export const HOMECREDIT_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  // Home Credit does not publish the network.
  {
    aliases: ["Home Credit Credit Card"],
    displayName: "Home Credit Card",
    issuerKey: "ph-homecredit",
    key: "ph-homecredit-home-credit-card",
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
