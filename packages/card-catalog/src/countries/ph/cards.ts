import type { CountryCards } from "../../vocabulary";
import { PH_ISSUERS } from "./issuers";
import { AUB_PRODUCTS } from "./products/aub";
import { BANKCOM_PRODUCTS } from "./products/bankcom";
import { BDO_PRODUCTS } from "./products/bdo";
import { BPI_PRODUCTS } from "./products/bpi";
import { CHINABANK_PRODUCTS } from "./products/chinabank";
import { EASTWEST_PRODUCTS } from "./products/eastwest";
import { EQUICOM_PRODUCTS } from "./products/equicom";
import { HOMECREDIT_PRODUCTS } from "./products/homecredit";
import { HSBC_PRODUCTS } from "./products/hsbc";
import { LANDBANK_PRODUCTS } from "./products/landbank";
import { MAYA_PRODUCTS } from "./products/maya";
import { MAYBANK_PRODUCTS } from "./products/maybank";
import { METROBANK_PRODUCTS } from "./products/metrobank";
import { PNB_PRODUCTS } from "./products/pnb";
import { RCBC_PRODUCTS } from "./products/rcbc";
import { SECURITYBANK_PRODUCTS } from "./products/securitybank";
import { UNIONBANK_PRODUCTS } from "./products/unionbank";
import { ZED_PRODUCTS } from "./products/zed";

export const PH_CARDS: CountryCards = {
  country: "ph",
  issuers: PH_ISSUERS,
  products: [
    ...BDO_PRODUCTS,
    ...BPI_PRODUCTS,
    ...METROBANK_PRODUCTS,
    ...UNIONBANK_PRODUCTS,
    ...RCBC_PRODUCTS,
    ...SECURITYBANK_PRODUCTS,
    ...EASTWEST_PRODUCTS,
    ...CHINABANK_PRODUCTS,
    ...PNB_PRODUCTS,
    ...AUB_PRODUCTS,
    ...BANKCOM_PRODUCTS,
    ...EQUICOM_PRODUCTS,
    ...HOMECREDIT_PRODUCTS,
    ...HSBC_PRODUCTS,
    ...LANDBANK_PRODUCTS,
    ...MAYA_PRODUCTS,
    ...MAYBANK_PRODUCTS,
    ...ZED_PRODUCTS,
  ],
};
