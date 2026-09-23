/**
 * Money formatting for display only. Amounts arrive as decimal strings and are
 * never summed here — arithmetic belongs to the server, which keeps 6-place
 * precision end to end.
 */

export type MoneySign = "auto" | "in" | "out" | "none";

export const MINUS = "−";

const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (
  currency: string,
  options: { compact?: boolean; fractionDigits?: number } = {}
): Intl.NumberFormat => {
  const key = `${currency}:${options.compact ? "c" : ""}:${options.fractionDigits ?? ""}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, {
        currency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: options.compact ? 1 : options.fractionDigits,
        minimumFractionDigits: options.compact ? 0 : options.fractionDigits,
        notation: options.compact ? "compact" : "standard",
        style: "currency",
      });
    } catch {
      // An unknown ISO code still has to render something legible.
      formatter = new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });
    }
    formatters.set(key, formatter);
  }
  return formatter;
};

export const toNumber = (value: string | number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface MoneyParts {
  currency: string;
  fraction: string;
  integer: string;
  negative: boolean;
  /** The currency symbol sits after the number in this locale. */
  trailingCurrency: boolean;
}

export const moneyParts = (
  value: string | number,
  currency: string,
  options: { compact?: boolean } = {}
): MoneyParts => {
  const amount = toNumber(value);
  const parts = formatterFor(currency, options).formatToParts(Math.abs(amount));
  let symbol = "";
  let integer = "";
  let fraction = "";
  let seenNumber = false;
  let trailingCurrency = false;
  for (const part of parts) {
    if (part.type === "currency") {
      symbol = part.value;
      trailingCurrency = seenNumber;
    } else if (part.type === "integer" || part.type === "group") {
      integer += part.value;
      seenNumber = true;
    } else if (part.type === "decimal" || part.type === "fraction") {
      fraction += part.value;
    } else if (part.type === "compact") {
      fraction += part.value;
    }
  }
  if (!symbol && currency) {
    symbol = `${currency} `;
  }
  return {
    currency: symbol,
    fraction,
    integer,
    negative: amount < 0,
    trailingCurrency,
  };
};

const signPrefix = (sign: MoneySign, negative: boolean): string => {
  if (sign === "in") {
    return "+";
  }
  if (sign === "out") {
    return MINUS;
  }
  if (sign === "auto" && negative) {
    return MINUS;
  }
  return "";
};

/** "−₱1,234.50", "+$20.00", "₱1.2K". */
export const formatMoney = (
  value: string | number,
  currency: string,
  options: { compact?: boolean; sign?: MoneySign } = {}
): string => {
  const parts = moneyParts(value, currency, options);
  const prefix = signPrefix(options.sign ?? "auto", parts.negative);
  const body = `${parts.integer}${parts.fraction}`;
  return parts.trailingCurrency
    ? `${prefix}${body} ${parts.currency.trim()}`
    : `${prefix}${parts.currency}${body}`;
};

/** Spoken form for assistive tech: the typographic minus reads badly. */
export const speakMoney = (
  value: string | number,
  currency: string,
  sign: MoneySign = "auto"
): string => {
  const parts = moneyParts(value, currency);
  const text = `${parts.currency}${parts.integer}${parts.fraction}`;
  if (sign === "in") {
    return `plus ${text}`;
  }
  if (sign === "out" || (sign === "auto" && parts.negative)) {
    return `minus ${text}`;
  }
  return text;
};

export { signPrefix };
