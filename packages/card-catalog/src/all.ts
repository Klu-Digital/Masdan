import { createCardCatalog } from "./catalog";
import { PH_CARDS } from "./countries/ph/cards";

/** Eager; the web app loads countries via `loadCardCountry` instead. */
export const cardCatalog = createCardCatalog([PH_CARDS]);
