import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.metrobank.com.ph/personal/cards/credit-cards and
// https://www.metrobank.com.ph/articles/new-credit-card-designs (2026 refresh)
export const METROBANK_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    displayName: "World Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 120,
        stops: ["#1b1b1a", "#2a2824"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "chevron-framed",
    },
  },
  {
    aliases: ["ICON", "Metrobank ICON"],
    displayName: "ICON World Elite Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-icon-world-elite-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1d1d1f", "#0b0b0c"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    displayName: "Platinum Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8b9097", "#5c6168"],
      },
      foreground: "light",
      pattern: "halftone",
    },
  },
  {
    displayName: "Titanium Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-titanium-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#2a2c30", "#0f1012"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
  {
    aliases: ["MFree", "M Free Mastercard"],
    displayName: "M Free",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-m-free-mastercard",
    network: "mastercard",
    visual: {
      accent: "#ece6f5",
      background: {
        angle: 120,
        stops: ["#7a4ea6", "#9467bd"],
      },
      foreground: "light",
      motif: "chevron",
    },
  },
  {
    aliases: ["Travel Signature", "Travel Visa Signature"],
    displayName: "Travel Signature Visa",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-travel-signature-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#161e40", "#0b1128"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Cashback", "Cash Back Visa"],
    displayName: "Cashback Visa",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-cashback-visa",
    network: "visa",
    visual: {
      accent: "#dce9e5",
      background: {
        angle: 120,
        stops: ["#0b5a4c", "#0f7a66"],
      },
      foreground: "light",
      motif: "chevron",
    },
  },
  {
    aliases: ["Rewards Plus Card", "Rewards Plus Visa", "Rewards Visa"],
    displayName: "Rewards Plus",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-rewards-plus-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#12306a", "#0b1f47"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["PSBank Mastercard", "PSBank Credit Card"],
    displayName: "PSBank Credit Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-psbank-credit-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#3f7fd1", "#2a63b3"],
      },
      foreground: "light",
      motif: "tiles",
    },
  },
  {
    aliases: ["Secured"],
    displayName: "Secured Credit Card",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-secured-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c4e9e", "#123670"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Hype", "Hype Card"],
    displayName: "Hype Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-hype-mastercard",
    network: "mastercard",
    visual: {
      accent: "#d9b25c",
      background: {
        angle: 90,
        stops: ["#d8434a", "#8a2c78", "#43298a"],
      },
      foreground: "light",
      motif: "chevron",
    },
  },
  {
    aliases: ["Hype", "Hype Card"],
    displayName: "Hype Visa",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-hype-visa",
    network: "visa",
    visual: {
      accent: "#d9b25c",
      background: {
        angle: 90,
        stops: ["#d8434a", "#8a2c78", "#43298a"],
      },
      foreground: "light",
      motif: "chevron",
    },
  },
  // Renamed Hype in May 2026; issued cards stay out there until renewal.
  {
    aliases: ["Vantage"],
    displayName: "Vantage Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-vantage-mastercard",
    network: "mastercard",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#55595f", "#2e3136"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Vantage"],
    displayName: "Vantage Visa",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-vantage-visa",
    network: "visa",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#55595f", "#2e3136"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Toyota", "Toyota Card", "Toyota Platinum Card"],
    displayName: "Toyota Platinum",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-toyota-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#d0202f",
      background: {
        angle: 135,
        stops: ["#26272b", "#111214"],
      },
      foreground: "light",
      motif: "arc-lines",
    },
  },
  {
    aliases: ["Toyota Card"],
    displayName: "Toyota Mastercard",
    issuerKey: "ph-metrobank",
    key: "ph-metrobank-toyota-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8e949a", "#2a2c30"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
];
