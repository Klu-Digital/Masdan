import type { CardProduct } from "../vocabulary";

// Reference: https://www.bankcom.com.ph/personal/credit-cards/
export const BANKCOM_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Mastercard Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "bankcom",
    key: "bankcom-classic-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c3f94", "#0f255c"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Mastercard Gold"],
    displayName: "Gold Mastercard",
    issuerKey: "bankcom",
    key: "bankcom-gold-mastercard",
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
    issuerKey: "bankcom",
    key: "bankcom-platinum-mastercard",
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
    aliases: ["Mastercard World"],
    displayName: "World Mastercard",
    issuerKey: "bankcom",
    key: "bankcom-world-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c1c1e", "#0a0a0b"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
];
