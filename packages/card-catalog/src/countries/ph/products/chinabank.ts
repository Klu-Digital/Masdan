import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.chinabank.ph/credit-cards
export const CHINABANK_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Wealth", "Wealth World Elite"],
    displayName: "Wealth World Elite Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-wealth-world-elite-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "pinstripes",
    },
  },
  {
    aliases: ["Landers", "Landers Visa"],
    displayName: "Landers Executive Visa Signature",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-landers-executive-visa-signature",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f3a2c", "#0f2118"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["@home", "At Home", "Home Visa"],
    displayName: "@home Visa Platinum",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-at-home-visa-platinum",
    network: "visa",
    visual: {
      background: {
        angle: 150,
        stops: ["#e0602a", "#8a2f6e"],
      },
      foreground: "light",
      motif: "facets-left",
      palette: ["#f28c38", "#d9463a", "#b0306a", "#6d2f8c"],
    },
  },
  {
    aliases: ["Velvet"],
    displayName: "Velvet Visa Signature",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-velvet-visa-signature",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#7a0f1f", "#3d0710"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "silk",
    },
  },
  {
    displayName: "World Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-world-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#18181a", "#08080a"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "hexagons",
    },
  },
  {
    aliases: ["Cash Rewards"],
    displayName: "Cash Rewards Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-cash-rewards-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#6e5e4c", "#4c4033"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "topographic",
    },
  },
  {
    displayName: "Platinum Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8c9299", "#5f656c"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Freedom"],
    displayName: "Freedom Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-freedom-mastercard",
    network: "mastercard",
    visual: {
      accent: "#f0d2b8",
      background: {
        angle: 135,
        stops: ["#b07a52", "#8a5a38"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "arc-lines",
    },
  },
  {
    aliases: ["Prime"],
    displayName: "Prime Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-prime-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8e1b22", "#5a0f14"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Destinations", "Destinations World"],
    displayName: "Destinations World Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-destinations-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 135,
        stops: ["#1a1a1a", "#080808"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "travel-seal",
    },
  },
  {
    aliases: ["Destinations Dollar", "Destinations World Dollar"],
    displayName: "Destinations World Dollar Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-destinations-world-dollar-mastercard",
    network: "mastercard",
    visual: {
      accent: "#9fc9b8",
      background: {
        angle: 135,
        stops: ["#1e3a36", "#0e1f1c"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "travel-seal",
    },
  },
  {
    aliases: ["Destinations", "Destinations Platinum"],
    displayName: "Destinations Platinum Mastercard",
    issuerKey: "ph-chinabank",
    key: "ph-chinabank-destinations-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#e6e8eb",
      background: {
        angle: 135,
        stops: ["#8c9299", "#5f656c"],
      },
      foreground: "light",
      motif: "travel-seal",
    },
  },
];
