import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.hsbc.com.ph/credit-cards/products/
export const HSBC_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Red Mastercard", "Red"],
    displayName: "Red Platinum Mastercard",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-red-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#e4e6e9", "#c9cdd2"],
      },
      foreground: "dark",
      motif: "facets-left",
      palette: ["#db0011", "#b0000e", "#ff3b4a", "#8a000a"],
    },
  },
  {
    aliases: ["Live+", "Live Plus"],
    displayName: "Live+ Credit Card",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-live-plus-visa-signature",
    network: "visa",
    visual: {
      background: {
        angle: 165,
        stops: ["#53064f", "#cc3e4c", "#bf626d", "#006fb5"],
      },
      foreground: "light",
      pattern: "crossed-light",
    },
  },
  {
    aliases: ["Premier"],
    displayName: "Premier Mastercard",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-premier-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c1c1e", "#0a0a0b"],
      },
      foreground: "light",
      motif: "facets",
      palette: ["#222226", "#18181b", "#2c2c30"],
    },
  },
  {
    aliases: ["Premier Travel"],
    displayName: "Premier Travel Card",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-premier-travel-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#1e1e20", "#0b0b0c"],
      },
      foreground: "light",
      motif: "facets",
      palette: ["#26262a", "#19191c", "#303034"],
    },
  },
  {
    aliases: ["Gold Visa", "Gold Visa Cashback"],
    displayName: "Gold Visa Cash Back",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-gold-visa-cash-back",
    network: "visa",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#b38b38", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "facets-left",
      palette: ["#caa24e", "#a67f2e", "#8a6620", "#d9b86a"],
    },
  },
  {
    aliases: ["Advance"],
    displayName: "Advance Visa",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-advance-visa",
    network: "visa",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f5f9c", "#123c66"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Mastercard Gold"],
    displayName: "Gold Mastercard",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-gold-mastercard",
    network: "mastercard",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#a98530", "#7f6018"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Visa Classic"],
    displayName: "Classic Visa",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-classic-visa",
    network: "visa",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#c20f1a", "#8a0a12"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Mastercard Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "ph-hsbc",
    key: "ph-hsbc-classic-mastercard",
    network: "mastercard",
    status: "legacy",
    visual: {
      background: {
        angle: 135,
        stops: ["#b50d18", "#7d0910"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
];
