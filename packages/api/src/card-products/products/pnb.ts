import type { CardProduct } from "../vocabulary";

// Reference: https://www.pnb.com.ph/cards/
export const PNB_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Essentials"],
    displayName: "Essentials Mastercard",
    issuerKey: "pnb",
    key: "pnb-essentials-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f4e9c", "#12306a"],
      },
      foreground: "light",
    },
  },
  {
    displayName: "Platinum Mastercard",
    issuerKey: "pnb",
    key: "pnb-platinum-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#848b93", "#565d64"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Ze-Lo", "Zelo", "Ze Lo"],
    displayName: "Ze-Lo Mastercard",
    issuerKey: "pnb",
    key: "pnb-ze-lo-mastercard",
    network: "mastercard",
    visual: {
      accent: "#e0262f",
      background: {
        angle: 135,
        stops: ["#f3f4f6", "#d6d9de"],
      },
      foreground: "dark",
      motif: "sweep",
      palette: ["#e0262f", "#b0287a", "#1f4fb8"],
    },
  },
  {
    aliases: ["Cashback Titanium", "Cashback"],
    displayName: "Cashback Titanium Mastercard",
    issuerKey: "pnb",
    key: "pnb-cashback-titanium-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1f4fa8", "#15367a"],
      },
      foreground: "light",
      monogram: "CASH\nBACK",
      motif: "wordmark",
    },
  },
  {
    aliases: ["Mabuhay Miles NOW", "PAL NOW", "Mabuhay Miles"],
    displayName: "PNB-PAL Mabuhay Miles NOW Mastercard",
    issuerKey: "pnb",
    key: "pnb-pal-mabuhay-miles-now-mastercard",
    network: "mastercard",
    visual: {
      accent: "#1d4f91",
      background: {
        angle: 135,
        stops: ["#e3e6ea", "#c8cdd3"],
      },
      foreground: "dark",
      motif: "wing-stripe",
    },
  },
  {
    aliases: ["Mabuhay Miles Platinum", "PAL Platinum", "Mabuhay Miles"],
    displayName: "PNB-PAL Mabuhay Miles Platinum Mastercard",
    issuerKey: "pnb",
    key: "pnb-pal-mabuhay-miles-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#1d4f91",
      background: {
        angle: 135,
        stops: ["#8b929a", "#5e656c"],
      },
      foreground: "light",
      motif: "wing-stripe",
    },
  },
  {
    aliases: ["Mabuhay Miles World", "PAL World", "Mabuhay Miles"],
    displayName: "PNB-PAL Mabuhay Miles World Mastercard",
    issuerKey: "pnb",
    key: "pnb-pal-mabuhay-miles-world-mastercard",
    network: "mastercard",
    visual: {
      accent: "#c9a24a",
      background: {
        angle: 135,
        stops: ["#15171b", "#060708"],
      },
      foreground: "light",
      motif: "wing-stripe",
    },
  },
  {
    aliases: ["Diamond", "Diamond UnionPay Card"],
    displayName: "Diamond UnionPay",
    issuerKey: "pnb",
    key: "pnb-diamond-unionpay",
    network: "unionpay",
    visual: {
      background: {
        angle: 135,
        stops: ["#5f7ea3", "#3c5878"],
      },
      foreground: "light",
      pattern: "angular-panels",
    },
  },
  {
    aliases: ["Visa Classic"],
    displayName: "Classic Visa",
    issuerKey: "pnb",
    key: "pnb-classic-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#2355b5", "#153779"],
      },
      foreground: "light",
    },
  },
  {
    aliases: ["Visa Gold"],
    displayName: "Gold Visa",
    issuerKey: "pnb",
    key: "pnb-gold-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#b3882c", "#876317"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Cart"],
    displayName: "Cart Mastercard",
    issuerKey: "pnb",
    key: "pnb-cart-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#0e7c8a", "#0a5660"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
  {
    aliases: ["Alturas"],
    displayName: "Alturas Visa",
    issuerKey: "pnb",
    key: "pnb-alturas-visa",
    network: "visa",
    visual: {
      accent: "#e3262b",
      background: {
        angle: 135,
        stops: ["#244f8f", "#132f5c"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: ["LSGHAA", "La Salle Green Hills Alumni Association"],
    displayName: "LSGHAA Platinum Mastercard",
    issuerKey: "pnb",
    key: "pnb-lsghaa-platinum-mastercard",
    network: "mastercard",
    visual: {
      accent: "#00703c",
      background: {
        angle: 135,
        stops: ["#7f878f", "#545b62"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
  {
    aliases: ["Platinum JCB"],
    displayName: "JCB Platinum",
    issuerKey: "pnb",
    key: "pnb-jcb-platinum",
    network: "jcb",
    visual: {
      background: {
        angle: 135,
        stops: ["#858c94", "#5a6168"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["World Elite", "Metal"],
    displayName: "World Elite Mastercard",
    issuerKey: "pnb",
    key: "pnb-world-elite-mastercard",
    network: "mastercard",
    visual: {
      background: {
        angle: 135,
        stops: ["#1c1c1e", "#0a0a0b"],
      },
      foreground: "light",
      pattern: "brushed",
    },
  },
];
