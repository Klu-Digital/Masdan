import type { CardProduct } from "../vocabulary";

// Reference: https://www.bpi.com.ph/personal/cards/credit-cards
export const BPI_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Visa Signature", "Signature Card"],
    displayName: "Signature",
    issuerKey: "bpi",
    key: "bpi-signature-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c1b19", "#0b0b0a"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Wealth Signature", "Signature Wealth Card"],
    displayName: "Signature Wealth",
    issuerKey: "bpi",
    key: "bpi-signature-wealth-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#161616", "#0a0a0a"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "dot-field",
    },
  },
  {
    aliases: ["Platinum Rewards Card", "Platinum Rewards Mastercard"],
    displayName: "Platinum Rewards",
    issuerKey: "bpi",
    key: "bpi-platinum-rewards-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#858d96", "#5d646c"],
      },
      foreground: "light",
      motif: "radial-dots",
    },
  },
  {
    aliases: ["Gold Rewards Card", "Gold Rewards Mastercard"],
    displayName: "Gold Rewards",
    issuerKey: "bpi",
    key: "bpi-gold-rewards-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#b8861b", "#8f6512"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "radial-dots",
    },
  },
  {
    aliases: ["Rewards Card", "Rewards Mastercard"],
    displayName: "Rewards",
    issuerKey: "bpi",
    key: "bpi-rewards-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1b2658", "#101838"],
      },
      foreground: "light",
      motif: "radial-dots",
    },
  },
  // Became the Robinsons Cashback Card in June 2026; old cards are still held.
  {
    aliases: ["Amore Platinum", "Amore Visa Platinum"],
    displayName: "Amore Platinum Cashback",
    issuerKey: "bpi",
    key: "bpi-amore-platinum-cashback-visa",
    network: "visa",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#80878f", "#5a6068"],
      },
      foreground: "light",
      pattern: "topographic",
    },
  },
  {
    aliases: ["Amore", "Amore Visa", "Amore Visa Classic"],
    displayName: "Amore Cashback",
    issuerKey: "bpi",
    key: "bpi-amore-cashback-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#5f9a8a", "#4d8676"],
      },
      foreground: "light",
      pattern: "topographic",
    },
  },
  {
    aliases: ["Edge Card", "Edge Mastercard"],
    displayName: "Edge",
    issuerKey: "bpi",
    key: "bpi-edge-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#b3202a", "#7d141c"],
      },
      foreground: "light",
      motif: "facets",
      palette: ["#d7263d", "#a4161a", "#6b7280", "#1f1f24", "#e05260"],
    },
  },
  {
    aliases: ["Petron", "Petron Card", "Petron BPI Mastercard"],
    displayName: "Petron BPI",
    issuerKey: "bpi",
    key: "bpi-petron-mastercard",
    network: "mastercard",
    visual: {
      accent: "#6aa8ff",
      background: {
        angle: 135,
        stops: ["#14205c", "#0a123a"],
      },
      foreground: "light",
      motif: "speed-lines",
    },
  },
  {
    aliases: ["Robinsons", "Robinsons Cashback Card"],
    displayName: "Robinsons Cashback",
    issuerKey: "bpi",
    key: "bpi-robinsons-cashback-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#c9252a", "#1d57b0"],
      },
      foreground: "light",
      motif: "chevron-stripes",
      palette: ["#e0282e", "#f26b1d", "#f5b700", "#1f5fbf", "#2a9d4b"],
    },
  },
  // BPI does not publish the network for Free+.
  {
    aliases: ["Free Plus", "Free+ Card"],
    displayName: "Free+",
    issuerKey: "bpi",
    key: "bpi-free-plus",
    network: "unknown",
    visual: {
      background: {
        angle: 45,
        stops: ["#2f9794", "#5552bd"],
      },
      foreground: "light",
    },
  },
  // BPI does not publish the network for OMNI.
  {
    aliases: ["Omni Card", "BPI Omni"],
    displayName: "OMNI",
    issuerKey: "bpi",
    key: "bpi-omni",
    network: "unknown",
    visual: {
      accent: "#4fd1c5",
      background: {
        angle: 135,
        stops: ["#3a2a6e", "#1f5b6e"],
      },
      foreground: "light",
      motif: "orbit",
    },
  },
  {
    aliases: ["Corporate Card"],
    displayName: "Corporate Mastercard",
    issuerKey: "bpi",
    key: "bpi-corporate-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#3a3f47", "#1c1f24"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  // OMNI replaced it in mid-2026; issued cards stay out there until renewal.
  {
    aliases: ["eCredit Card"],
    displayName: "eCredit",
    issuerKey: "bpi",
    key: "bpi-ecredit",
    network: "unknown",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#4a2d86", "#2a1854"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
];
