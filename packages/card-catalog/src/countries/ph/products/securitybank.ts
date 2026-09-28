import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.securitybank.com/personal/credit-cards/
export const SECURITYBANK_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Wave"],
    displayName: "Wave Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-wave-mastercard",
    network: "mastercard",
    visual: {
      accent: "#0b2a5b",
      background: {
        angle: 135,
        stops: ["#bcd9f2", "#9cc3e6"],
      },
      bankMarkTone: "brand",
      foreground: "dark",
      motif: "sweep",
      pattern: "topographic",
    },
  },
  {
    aliases: ["Next", "Next Titanium Mastercard"],
    displayName: "Next Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-next-titanium-mastercard",
    network: "mastercard",
    visual: {
      accent: "#9aa3ad",
      background: {
        angle: 135,
        stops: ["#2b2e33", "#121417"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    displayName: "Gold Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-gold-mastercard",
    network: "mastercard",
    visual: {
      accent: "#f0dca0",
      background: {
        angle: 135,
        stops: ["#b38b38", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    displayName: "Platinum Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#e6e8eb",
      background: {
        angle: 135,
        stops: ["#8c9299", "#5f656c"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    displayName: "World Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9ced4",
      background: {
        angle: 135,
        stops: ["#1a1a1c", "#08080a"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    aliases: ["Complete Cashback", "Cashback Platinum Mastercard"],
    displayName: "Complete Cashback Platinum Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-complete-cashback-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#d8dbdf", "#b9bdc2"],
      },
      foreground: "dark",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Mastercard Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-classic-mastercard",
    network: "mastercard",
    visual: {
      accent: "#9fc0e8",
      background: {
        angle: 135,
        stops: ["#1c4f8f", "#0f2f5c"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    aliases: ["Corporate Card"],
    displayName: "Corporate Mastercard",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-corporate-mastercard",
    network: "mastercard",
    visual: {
      accent: "#aeb4bb",
      background: {
        angle: 135,
        stops: ["#3a3f47", "#1c1f24"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
  {
    aliases: ["Fast Track", "Online Fast Track", "Fast Track Secured"],
    displayName: "Fast Track Credit Card",
    issuerKey: "ph-securitybank",
    key: "ph-securitybank-fast-track-credit-card",
    network: "unknown",
    visual: {
      accent: "#bcd9f2",
      background: {
        angle: 135,
        stops: ["#2f6fb5", "#1a4a80"],
      },
      foreground: "light",
      motif: "s-ribbon",
    },
  },
];
