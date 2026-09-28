import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://www.bdo.com.ph/personal/cards/credit-cards
export const BDO_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    displayName: "Visa Classic",
    issuerKey: "ph-bdo",
    key: "ph-bdo-visa-classic",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#123a8c", "#0b2766"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "Visa Gold",
    issuerKey: "ph-bdo",
    key: "ph-bdo-visa-gold",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#b08a3a", "#8a6620"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "Visa Platinum",
    issuerKey: "ph-bdo",
    key: "ph-bdo-visa-platinum",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#8a9098", "#5e646b"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "Visa Signature",
    issuerKey: "ph-bdo",
    key: "ph-bdo-visa-signature",
    network: "visa",
    visual: {
      accent: "#2f5fb8",
      background: {
        angle: 135,
        stops: ["#0e1a36", "#07101f"],
      },
      foreground: "light",
      motif: "tiles",
    },
  },
  {
    aliases: ["Standard Mastercard", "Classic Mastercard"],
    displayName: "Standard Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-standard-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#133b8f", "#0a2462"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "Gold Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-gold-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#b58c38", "#8c681f"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "Platinum Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8c9299", "#60666d"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["ShopMore Purple", "SM ShopMore Purple"],
    displayName: "ShopMore Mastercard — Purple",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-purple",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#7f80cf", "#7475c6"],
      },
      foreground: "light",
      monogram: "Shop\nMore",
      motif: "wordmark",
    },
  },
  {
    aliases: ["ShopMore Yellow Green", "ShopMore Green", "SM ShopMore Green"],
    displayName: "ShopMore Mastercard — Yellow Green",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-yellow-green",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#c8db3a", "#bcd02e"],
      },
      foreground: "dark",
      monogram: "Shop\nMore",
      motif: "wordmark",
    },
  },
  {
    aliases: ["ShopMore Orange", "SM ShopMore Orange"],
    displayName: "ShopMore Mastercard — Orange",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-orange",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#e8664f", "#de5a43"],
      },
      foreground: "light",
      monogram: "Shop\nMore",
      motif: "wordmark",
    },
  },
  {
    aliases: ["Amex Blue", "Blue American Express"],
    displayName: "Blue from American Express",
    issuerKey: "ph-bdo",
    key: "ph-bdo-blue-american-express",
    network: "amex",
    visual: {
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#9cc7ea", "#7fb3df"],
      },
      foreground: "dark",
      motif: "medallion",
    },
  },
  {
    aliases: ["Amex Cashback"],
    displayName: "American Express Cashback",
    issuerKey: "ph-bdo",
    key: "ph-bdo-american-express-cashback",
    network: "amex",
    visual: {
      accent: "#9cc7ea",
      background: {
        angle: 135,
        stops: ["#123d8f", "#0b2a6a"],
      },
      foreground: "light",
      motif: "medallion",
    },
  },
  {
    aliases: ["Amex Explorer"],
    displayName: "American Express Explorer",
    issuerKey: "ph-bdo",
    key: "ph-bdo-american-express-explorer",
    network: "amex",
    visual: {
      accent: "#8fc3ea",
      background: {
        angle: 135,
        stops: ["#1a2233", "#0d121c"],
      },
      foreground: "light",
      motif: "frame",
    },
  },
  {
    aliases: ["Amex Platinum"],
    displayName: "American Express Platinum",
    issuerKey: "ph-bdo",
    key: "ph-bdo-american-express-platinum",
    network: "amex",
    visual: {
      accent: "#8a9098",
      background: {
        angle: 135,
        stops: ["#d3d7db", "#b5babf"],
      },
      foreground: "dark",
      motif: "medallion",
    },
  },
  {
    aliases: ["Lucky Cat", "JCB Lucky Cat Card"],
    displayName: "JCB Lucky Cat",
    issuerKey: "ph-bdo",
    key: "ph-bdo-jcb-lucky-cat",
    network: "jcb",
    visual: {
      accent: "#f2c230",
      background: {
        angle: 135,
        stops: ["#2f7fd6", "#1f63b8"],
      },
      foreground: "light",
      motif: "medallion",
    },
  },
  {
    displayName: "JCB Gold",
    issuerKey: "ph-bdo",
    key: "ph-bdo-jcb-gold",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#ad8836", "#86641e"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    displayName: "JCB Platinum",
    issuerKey: "ph-bdo",
    key: "ph-bdo-jcb-platinum",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#878d95", "#5b6168"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Bench"],
    displayName: "Bench Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-bench-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#dcdee1", "#c3c6ca"],
      },
      foreground: "dark",
      motif: "contours",
      palette: ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#9b5de5"],
    },
  },
  {
    aliases: ["HOPE"],
    displayName: "HOPE Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-hope-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#8f959c", "#62686f"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["World Elite"],
    displayName: "World Elite Mastercard",
    issuerKey: "ph-bdo",
    key: "ph-bdo-world-elite-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#2a2a2c", "#101011"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Installment"],
    displayName: "Installment Card",
    issuerKey: "ph-bdo",
    key: "ph-bdo-installment-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f6fe0", "#1554c0"],
      },
      foreground: "light",
      motif: "tiles",
    },
  },
  {
    aliases: ["UnionPay Gold"],
    displayName: "Gold UnionPay",
    issuerKey: "ph-bdo",
    key: "ph-bdo-gold-unionpay",
    network: "unionpay",
    visual: {
      background: {
        angle: 135,
        stops: ["#b38b38", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["UnionPay Diamond"],
    displayName: "Diamond UnionPay",
    issuerKey: "ph-bdo",
    key: "ph-bdo-diamond-unionpay",
    network: "unionpay",
    visual: {
      background: {
        angle: 135,
        stops: ["#1d1f24", "#0c0d10"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Diners Club", "Diners"],
    displayName: "Diners Club International",
    issuerKey: "ph-bdo",
    key: "ph-bdo-diners-club-international",
    network: "diners",
    visual: {
      background: {
        angle: 135,
        stops: ["#b9bec3", "#9aa0a6"],
      },
      foreground: "dark",
      motif: "globe",
    },
  },
  {
    aliases: ["Diners Premiere"],
    displayName: "Diners Club Premiere",
    issuerKey: "ph-bdo",
    key: "ph-bdo-diners-club-premiere",
    network: "diners",
    visual: {
      background: {
        angle: 135,
        stops: ["#2c3036", "#15171b"],
      },
      foreground: "light",
      motif: "globe",
    },
  },
  {
    aliases: ["Secured"],
    displayName: "Secured Credit Card",
    issuerKey: "ph-bdo",
    key: "ph-bdo-secured-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#1b4aa6", "#0f3278"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
];
