import { createCardCatalog } from "./catalog";
import { PH_CARDS } from "./countries/ph/cards";

/**
 * Every country, loaded eagerly: for the server and tests. The web app loads
 * countries on demand through `loadCardCountry` instead.
 */
export const cardCatalog = createCardCatalog([PH_CARDS]);
