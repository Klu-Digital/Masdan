import type { CardProduct } from "../vocabulary";

// Reference: https://www.landbank.com/cards/landbank-credit-card
export const LANDBANK_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Landbank Credit Card", "Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "landbank",
    key: "landbank-classic-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#0a7a3f", "#07542b"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Gold"],
    displayName: "Gold Mastercard",
    issuerKey: "landbank",
    key: "landbank-gold-mastercard",
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
    aliases: ["Corporate"],
    displayName: "Corporate Mastercard",
    issuerKey: "landbank",
    key: "landbank-corporate-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1d3b2c", "#0d1f16"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
];
