import type { CardProduct } from "../vocabulary";

// Reference: https://www.mayabank.ph/creditcard/
export const MAYA_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Black", "Maya Black Visa"],
    displayName: "Maya Black",
    issuerKey: "maya",
    key: "maya-black-visa",
    network: "visa",
    visual: {
      accent: "#04b36b",
      background: {
        angle: 135,
        stops: ["#161616", "#060606"],
      },
      foreground: "light",
      pattern: "dot-matrix",
    },
  },
  {
    aliases: ["Black Express"],
    displayName: "Maya Black Express",
    issuerKey: "maya",
    key: "maya-black-express-visa",
    network: "visa",
    visual: {
      accent: "#04b36b",
      background: {
        angle: 135,
        stops: ["#222222", "#0c0c0c"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Landers", "Landers Cashback"],
    displayName: "Landers Cashback Everywhere",
    issuerKey: "maya",
    key: "maya-landers-cashback-everywhere-visa",
    network: "visa",
    visual: {
      accent: "#f58220",
      background: {
        angle: 135,
        stops: ["#12305c", "#0a1c38"],
      },
      foreground: "light",
      motif: "co-brand-stripe",
    },
  },
];
