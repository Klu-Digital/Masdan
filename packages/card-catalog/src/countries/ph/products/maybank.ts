import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.maybank.com.ph/en/personal/cards/credit-cards.page
export const MAYBANK_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Mastercard Standard"],
    displayName: "Standard Mastercard",
    issuerKey: "ph-maybank",
    key: "ph-maybank-standard-mastercard",
    network: "mastercard",
    visual: {
      accent: "#d0202f",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Mastercard Gold"],
    displayName: "Gold Mastercard",
    issuerKey: "ph-maybank",
    key: "ph-maybank-gold-mastercard",
    network: "mastercard",
    visual: {
      accent: "#d4a62a",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Mastercard Platinum"],
    displayName: "Platinum Mastercard",
    issuerKey: "ph-maybank",
    key: "ph-maybank-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#9aa0a6",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Classic Visa"],
    displayName: "Visa Classic",
    issuerKey: "ph-maybank",
    key: "ph-maybank-visa-classic",
    network: "visa",
    visual: {
      accent: "#c81e2c",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Gold Visa"],
    displayName: "Visa Gold",
    issuerKey: "ph-maybank",
    key: "ph-maybank-visa-gold",
    network: "visa",
    visual: {
      accent: "#cf9f24",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Platinum Visa"],
    displayName: "Visa Platinum",
    issuerKey: "ph-maybank",
    key: "ph-maybank-visa-platinum",
    network: "visa",
    visual: {
      accent: "#959ba1",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
      motif: "peaks",
    },
  },
  {
    aliases: ["Infinite"],
    displayName: "Visa Infinite",
    issuerKey: "ph-maybank",
    key: "ph-maybank-visa-infinite",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "skyline",
    },
  },
  {
    aliases: ["Manchester United", "Man Utd"],
    displayName: "Manchester United Credit Card",
    issuerKey: "ph-maybank",
    key: "ph-maybank-manchester-united-visa",
    network: "visa",
    visual: {
      accent: "#fbe122",
      background: {
        angle: 135,
        stops: ["#c70101", "#8a0000"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
];
