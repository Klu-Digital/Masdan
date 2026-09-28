import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://online.aub.ph/creditcards
export const AUB_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Easy", "AUB Easy"],
    displayName: "Easy Mastercard",
    issuerKey: "ph-aub",
    key: "ph-aub-easy-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#d7262d", "#9e1a20"],
      },
      foreground: "light",
      pattern: "diagonal-lines",
    },
  },
  {
    aliases: ["Mastercard Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "ph-aub",
    key: "ph-aub-classic-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f4f9c", "#12306a"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Mastercard Gold"],
    displayName: "Gold Mastercard",
    issuerKey: "ph-aub",
    key: "ph-aub-gold-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#b3882c", "#8a6517"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Mastercard Platinum"],
    displayName: "Platinum Mastercard",
    issuerKey: "ph-aub",
    key: "ph-aub-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#858c94", "#5a6168"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Secured"],
    displayName: "Secured Credit Card",
    issuerKey: "ph-aub",
    key: "ph-aub-secured-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#2a5bb0", "#163a78"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Corporate"],
    displayName: "Corporate Credit Card",
    issuerKey: "ph-aub",
    key: "ph-aub-corporate-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#3a3f47", "#1c1f24"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
];
