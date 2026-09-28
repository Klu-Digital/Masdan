import type { CardProduct } from "../../../vocabulary";
import type { PhIssuerKey } from "../issuers";

// Reference: https://rcbccredit.com/credit-cards
export const RCBC_PRODUCTS: readonly CardProduct<PhIssuerKey>[] = [
  {
    aliases: ["Flex Gold"],
    displayName: "Flex Gold Visa",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-flex-gold-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#c9a04a", "#a8812c"],
      },
      chipTone: "gold",
      foreground: "dark",
      motif: "skyline",
      palette: ["#e0368c", "#7b5cd6", "#2bb6c9", "#f28fb8"],
    },
  },
  {
    aliases: ["Flex"],
    displayName: "Flex Visa",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-flex-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#35b8d6", "#1f9fc0"],
      },
      foreground: "dark",
      motif: "skyline",
      palette: ["#e0368c", "#7b5cd6", "#f28fb8", "#3b5bdb"],
    },
  },
  {
    displayName: "Visa Platinum",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-visa-platinum",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#8c9299", "#5f656c"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    displayName: "Visa Infinite",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-visa-infinite",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#18181a", "#060607"],
      },
      chipTone: "gold",
      foreground: "light",
    },
  },
  {
    displayName: "World Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#8fb8ff",
      background: {
        angle: 135,
        stops: ["#0f1a3a", "#070d20"],
      },
      foreground: "light",
      motif: "planet",
    },
  },
  {
    aliases: ["Hexagon Priority", "Hexagon Club Priority World Mastercard"],
    displayName: "Hexagon Club Priority",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-hexagon-club-priority",
    network: "mastercard",
    visual: {
      accent: "#8fb0d0",
      background: {
        angle: 135,
        stops: ["#141518", "#060708"],
      },
      foreground: "light",
      motif: "hex-rings",
    },
  },
  {
    aliases: ["Hexagon Privilege", "Hexagon Club Platinum Mastercard"],
    displayName: "Hexagon Club Privilege",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-hexagon-club-privilege",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 135,
        stops: ["#161412", "#070605"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "hex-rings",
    },
  },
  {
    displayName: "Gold Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-gold-mastercard",
    network: "mastercard",
    visual: {
      accent: "#e8cf8a",
      background: {
        angle: 135,
        stops: ["#b38b38", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      motif: "hex-rings",
    },
  },
  {
    aliases: ["JCB Gold"],
    displayName: "Gold JCB",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-gold-jcb",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#b38b36", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "topographic",
    },
  },
  {
    aliases: ["Platinum JCB"],
    displayName: "JCB Platinum",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-jcb-platinum",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#141c44", "#0b1130"],
      },
      foreground: "light",
      pattern: "hexagons",
    },
  },
  {
    aliases: ["YGC Rewards", "YGC Rewards Plus Mastercard"],
    displayName: "YGC Rewards Plus",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-ygc-rewards-plus-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 135,
        stops: ["#1a1a1c", "#08080a"],
      },
      foreground: "light",
      pattern: "pinstripes",
    },
  },
  {
    aliases: ["ZALORA", "ZALORA Mastercard"],
    displayName: "ZALORA Credit Card",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-zalora-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#141414", "#060606"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Airmiles"],
    displayName: "Airmiles Visa Signature",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-airmiles-visa-signature",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#1a1a1c", "#08080a"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Infinite Dollar"],
    displayName: "Visa Infinite Dollar",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-visa-infinite-dollar",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#1b1b1d", "#070708"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Black Card", "RCBC Black"],
    displayName: "Black Card Platinum Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-black-card-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#161618", "#070708"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Diamond Card", "RCBC Diamond"],
    displayName: "Diamond Card Platinum Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-diamond-card-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#eceef1", "#cfd3d8"],
      },
      foreground: "dark",
      motif: "facets",
      palette: ["#ffffff", "#dfe3e8", "#c5cad1", "#eef1f4"],
    },
  },
  {
    aliases: ["Mastercard Classic"],
    displayName: "Classic Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-classic-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f5bb8", "#123d86"],
      },
      foreground: "light",
      motif: "facets",
      palette: ["#2a6ad0", "#1a4fa8", "#3d7fe0", "#15428f"],
    },
  },
  {
    aliases: ["JCB Classic"],
    displayName: "Classic JCB",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-classic-jcb",
    network: "jcb",
    visual: {
      accent: "#dbe7f5",
      background: {
        angle: 135,
        stops: ["#15306e", "#0c1f4c"],
      },
      foreground: "light",
      motif: "wave-ribbon",
    },
  },
  // RCBC issues the AirAsia cards on more than one network.
  {
    aliases: ["AirAsia", "AirAsia Classic"],
    displayName: "AirAsia Credit Card",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-airasia-credit-card",
    network: "unknown",
    visual: {
      background: {
        angle: 135,
        stops: ["#e21b23", "#b3121a"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["AirAsia Platinum"],
    displayName: "AirAsia Platinum Credit Card",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-airasia-platinum-credit-card",
    network: "unknown",
    visual: {
      accent: "#e21b23",
      background: {
        angle: 135,
        stops: ["#161616", "#060606"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: ["Landmark", "Ansons", "Landmark Ansons"],
    displayName: "Landmark Anson's Mastercard",
    issuerKey: "ph-rcbc",
    key: "ph-rcbc-landmark-ansons-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#b38b38", "#8f6c24"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "fine-lines",
    },
  },
];
