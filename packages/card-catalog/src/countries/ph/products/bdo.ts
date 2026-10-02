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
        stops: ["#0a7fc2", "#055a8c", "#0a74b4"],
      },
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#b48e1a", "#91700c", "#ad8918"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#8f8f95", "#606066", "#8a8a90"],
      },
      foreground: "light",
      pattern: "rounded-panels",
    },
  },
  {
    displayName: "Visa Signature",
    issuerKey: "ph-bdo",
    key: "ph-bdo-visa-signature",
    network: "visa",
    visual: {
      accent: "#2f6fd8",
      background: {
        angle: 135,
        stops: ["#151b28", "#0b1730", "#121726"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#0b4a70", "#03263f", "#0a4466"],
      },
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#b48e1a", "#91700c", "#ad8918"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#86868a", "#57575b", "#808084"],
      },
      foreground: "light",
      pattern: "rounded-panels",
    },
  },
  {
    aliases: ["ShopMore Purple", "SM ShopMore Purple"],
    displayName: "ShopMore Mastercard — Purple",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-purple",
    network: "mastercard",
    visual: {
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#8186c4", "#777cb9"],
      },
      foreground: "light",
      monogram: "Shop\nMore",
      motif: "wordmark-left",
    },
  },
  {
    aliases: ["ShopMore Yellow Green", "ShopMore Green", "SM ShopMore Green"],
    displayName: "ShopMore Mastercard — Yellow Green",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-yellow-green",
    network: "mastercard",
    visual: {
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#cfd920", "#c6d00c"],
      },
      foreground: "dark",
      monogram: "Shop\nMore",
      motif: "wordmark-left",
    },
  },
  {
    aliases: ["ShopMore Orange", "SM ShopMore Orange"],
    displayName: "ShopMore Mastercard — Orange",
    issuerKey: "ph-bdo",
    key: "ph-bdo-shopmore-mastercard-orange",
    network: "mastercard",
    visual: {
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#eb6d57", "#e5604a"],
      },
      foreground: "light",
      monogram: "Shop\nMore",
      motif: "wordmark-left",
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
        stops: ["#b4d6ef", "#6fa6d2", "#9cc8e6"],
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
      accent: "#4f86e0",
      background: {
        angle: 135,
        stops: ["#0f2f8c", "#03104a", "#0a2577"],
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
      accent: "#8fa9c2",
      background: {
        angle: 135,
        stops: ["#3a4654", "#151b23", "#2a3542"],
      },
      foreground: "light",
      motif: "frame",
      pattern: "dot-matrix",
    },
  },
  {
    aliases: ["Amex Platinum"],
    displayName: "American Express Platinum",
    issuerKey: "ph-bdo",
    key: "ph-bdo-american-express-platinum",
    network: "amex",
    visual: {
      accent: "#5a5d61",
      background: {
        angle: 135,
        stops: ["#e2e3e4", "#a4a6a8", "#d6d7d9"],
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
      accent: "#ffffff",
      background: {
        angle: 135,
        stops: ["#1c93d8", "#0a74c2"],
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
        stops: ["#b48e1a", "#91700c", "#ad8918"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#8d8d98", "#62626d", "#8a8a95"],
      },
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#c7c6ca", "#a9a8ad"],
      },
      foreground: "dark",
      motif: "contours",
      palette: ["#ef4f7c", "#f59a3a", "#e8d23a", "#3fb59a", "#6a62e0"],
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
        stops: ["#c8c9ca", "#9fa1a2"],
      },
      foreground: "dark",
      monogram: "HOPE",
      motif: "wordmark",
      pattern: "brushed",
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
        stops: ["#38373a", "#1c1b1d"],
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
        stops: ["#0a8fd4", "#0570c0", "#0a88cc"],
      },
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#ad8a1c", "#8a6a0e", "#a8861a"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#2e2d3a", "#1b1b25", "#2a2a35"],
      },
      foreground: "light",
      pattern: "rounded-panels",
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
        stops: ["#c4c5ca", "#989aa1"],
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
        stops: ["#5c5c66", "#393942"],
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
        stops: ["#0a7fc2", "#055a8c", "#0a74b4"],
      },
      foreground: "light",
      pattern: "rounded-panels",
    },
  },
];
