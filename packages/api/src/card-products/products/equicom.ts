import type { CardProduct } from "../vocabulary";

// Reference: https://www.equicomsavings.com/product-and-services/card-products/
export const EQUICOM_PRODUCTS: readonly CardProduct[] = [
  {
    aliases: ["Classic Credit Card"],
    displayName: "Classic Visa",
    issuerKey: "equicom",
    key: "equicom-classic-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#0f7a43", "#0a5530"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
  {
    aliases: ["Gold Credit Card"],
    displayName: "Gold Visa",
    issuerKey: "equicom",
    key: "equicom-gold-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#b3882c", "#8a6517"],
      },
      chipTone: "gold",
      foreground: "light",
      pattern: "brushed",
    },
  },
  {
    aliases: ["Business Card"],
    displayName: "Business Visa",
    issuerKey: "equicom",
    key: "equicom-business-visa",
    network: "visa",
    visual: {
      background: {
        angle: 135,
        stops: ["#3a3f47", "#1c1f24"],
      },
      foreground: "light",
      pattern: "fine-lines",
    },
  },
];
