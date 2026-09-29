"use client";

import { formatMoney } from "@/components/finance/money";
import {
  PRIVACY_MASK,
  usePrivacyMode,
} from "@/components/finance/privacy-mode";

type FormatMoney = typeof formatMoney;

/** `formatMoney` for text that can't be an `<Amount>`; masked while privacy mode is on. */
export const useFormattedMoney = (): FormatMoney => {
  const [privacyOn] = usePrivacyMode();
  return privacyOn ? () => PRIVACY_MASK : formatMoney;
};
