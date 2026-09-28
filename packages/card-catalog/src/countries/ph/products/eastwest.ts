import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.eastwestbanker.com/cards/creditcards
export const EASTWEST_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Privilege Mastercard", "Privilege Classic"],
    displayName: "Privilege Classic Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-privilege-classic-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#6b2c91", "#461a61"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Privilege Visa", "Privilege Classic"],
    displayName: "Visa Privilege Classic",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-visa-privilege-classic",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#6b2c91", "#461a61"],
      },
      foreground: "light",
    },
  },
  {
    displayName: "Gold Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-gold-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#c8a86b", "#a8874a"],
      },
      chipTone: "gold",
      foreground: "dark",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Gold Visa"],
    displayName: "Visa Gold",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-visa-gold",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#c8a86b", "#a8874a"],
      },
      chipTone: "gold",
      foreground: "dark",
      pattern: "scallops",
    },
  },
  {
    aliases: ["Platinum Visa"],
    displayName: "Visa Platinum",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-visa-platinum",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#3a3d42", "#1c1e21"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Mastercard Platinum"],
    displayName: "Platinum Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8a9199", "#5d636a"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    displayName: "JCB Gold",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-jcb-gold",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#c8a86b", "#a8874a"],
      },
      chipTone: "gold",
      foreground: "dark",
      pattern: "fine-lines",
    },
  },
  {
    displayName: "JCB Platinum",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-jcb-platinum",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#8a9199", "#5d636a"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["EveryDay", "Everyday Titanium"],
    displayName: "EveryDay Titanium Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-everyday-titanium-mastercard",
    network: "mastercard",
    visual: {
      accent: "#f59e0b",
      background: {
        angle: 135,
        stops: ["#2f3b45", "#151c22"],
      },
      foreground: "light",
      pattern: "diagonal-lines",
    },
  },
  {
    aliases: ["Dolce Vita"],
    displayName: "Dolce Vita Titanium Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-dolce-vita-titanium-mastercard",
    network: "mastercard",
    visual: {
      accent: "#f4c2d7",
      background: {
        angle: 135,
        stops: ["#8e1b4b", "#4f0d29"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: [
      "KrisFlyer Platinum",
      "Singapore Airlines KrisFlyer Platinum Mastercard",
    ],
    displayName: "KrisFlyer Platinum Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-krisflyer-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c5a572",
      background: {
        angle: 135,
        stops: ["#7f868e", "#50575e"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: [
      "KrisFlyer World",
      "Singapore Airlines KrisFlyer World Mastercard",
    ],
    displayName: "KrisFlyer World Mastercard",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-krisflyer-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c5a572",
      background: {
        angle: 135,
        stops: ["#1b2a4a", "#0b1428"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: ["Priority", "Priority Visa"],
    displayName: "Priority Visa Infinite",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-priority-visa-infinite",
    network: "visa",
    visual: {
      accent: "#b08d57",
      background: {
        angle: 135,
        stops: ["#161616", "#050505"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["foodpanda"],
    displayName: "foodpanda Visa",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-foodpanda-visa",
    network: "visa",
    visual: {
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#e21b70", "#b0105a"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: ["Puregold", "Always Panalo"],
    displayName: "Puregold Always Panalo Visa",
    issuerKey: "ph-eastwest",
    key: "ph-eastwest-puregold-always-panalo-visa",
    network: "visa",
    visual: {
      accent: "#ffd100",
      background: {
        angle: 135,
        stops: ["#0b7a3b", "#075428"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
];
