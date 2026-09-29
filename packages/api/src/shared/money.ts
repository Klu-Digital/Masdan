import { z } from "zod";

/** Leaf module: the web forms validate amounts with these too. */

export const AMOUNT_SCALE = 6;
const decimalPattern = /^-?\d+(?<fraction>\.\d{1,6})?$/u;
const nonNegativeDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;
const SCALE_FACTOR = 1_000_000n;

export const positiveAmount = z
  .string()
  .trim()
  .regex(nonNegativeDecimalPattern, "Use a positive amount")
  .refine((value) => /[1-9]/u.test(value), "Amount must be greater than zero");

export const nonNegativeAmount = z
  .string()
  .trim()
  .regex(nonNegativeDecimalPattern, "Use a non-negative amount");

/** Balances and opening balances, which may be negative. */
export const signedAmount = z
  .string()
  .trim()
  .regex(decimalPattern, "Use a valid amount");

export const scaledAmount = (value: string): bigint => {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(6, "0"));
};

/** Inverse of `scaledAmount` for non-negatives: `1500000n` → `"1.5"`. */
export const formatScaledAmount = (scaled: bigint): string => {
  const whole = scaled / SCALE_FACTOR;
  const fraction = (scaled % SCALE_FACTOR)
    .toString()
    .padStart(AMOUNT_SCALE, "0")
    .replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

/** `scaledAmount` for ledger results, which can be negative: `"-1.5"` → `-1500000n`. */
export const signedScaledAmount = (value: string): bigint => {
  const trimmed = value.trim();
  return trimmed.startsWith("-")
    ? -scaledAmount(trimmed.slice(1))
    : scaledAmount(trimmed);
};

/** Fixed six places, the way Postgres prints `numeric(30,6)`: `-1500000n` → `"-1.500000"`. */
export const fixedAmountText = (scaled: bigint): string => {
  const sign = scaled < 0n ? "-" : "";
  const magnitude = scaled < 0n ? -scaled : scaled;
  const fraction = (magnitude % SCALE_FACTOR)
    .toString()
    .padStart(AMOUNT_SCALE, "0");
  return `${sign}${magnitude / SCALE_FACTOR}.${fraction}`;
};

/** Display ledger decimals without losing precision to Number. */
export const formatDisplayMoney = (
  amount: string,
  currencyCode: string,
  locale: string,
  omitWholeFraction = false
): string => {
  const minimumFractionDigits =
    omitWholeFraction && /^-?\d+(?:\.0+)?$/u.test(amount) ? 0 : undefined;
  const decimal = amount as `${number}`;
  try {
    return new Intl.NumberFormat(locale, {
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits,
      style: "currency",
    }).format(decimal);
  } catch {
    return `${currencyCode} ${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: minimumFractionDigits ?? 2,
    }).format(decimal)}`;
  }
};
