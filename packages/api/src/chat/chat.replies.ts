import type { QuickEntryKind } from "../transactions/quick-entry";
import { QUICK_ENTRY_MAX_LENGTH } from "../transactions/quick-entry";

/**
 * Every message chat entry sends, on any channel, as plain text: nothing a
 * user typed or named an account can turn into markup.
 */

const EXAMPLE = "“dinner at jollibee 400 metrobank mc”";
const WHERE_TO_LINK =
  "In Masdan, open Settings → Household → Chat apps, make a code, then send /link followed by the code here.";

const finishIn = (link: string | null): string =>
  link ? `\n\nFinish it in Masdan: ${link}` : "";

const formatAmount = (amount: string, currencyCode: string): string => {
  const value = Number(amount);
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-PH", {
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
      style: "currency",
    }).format(value);
  } catch {
    // An unknown ISO code still has to read as money.
    return `${currencyCode} ${value.toFixed(fractionDigits)}`;
  }
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const sentenceCase = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const chatReplies = {
  aiFailed: (link: string | null) =>
    `I couldn’t read that right now, so nothing was added. Try again in a moment.${finishIn(link)}`,
  created: ({
    accountName,
    amount,
    currencyCode,
    kind,
    notes,
  }: {
    accountName: string;
    amount: string;
    currencyCode: string;
    kind: QuickEntryKind;
    notes: string | null;
  }) =>
    [
      `Added ${formatAmount(amount, currencyCode)} ${kind}`,
      notes ? sentenceCase(notes) : null,
      accountName,
    ]
      .filter(Boolean)
      .join("\n"),
  help: `Send a transaction like ${EXAMPLE} and I’ll add it to your household.\n\nNot linked yet? ${WHERE_TO_LINK}`,
  linkFailed:
    "That code didn’t work. Codes work once and expire after 10 minutes — make a new one in Masdan under Settings → Household → Chat apps.",
  linked: (householdName: string) =>
    `Linked to ${householdName}. Send a transaction like ${EXAMPLE} to add it.`,
  needsReview: (issues: readonly string[], link: string | null) =>
    [
      "Nothing was added yet:",
      ...unique(issues).map((issue) => `• ${issue}`),
    ].join("\n") + finishIn(link),
  noAccess:
    "This account can no longer add transactions to that household, so nothing was added. If that’s changed, link it again from Masdan.",
  queueUnavailable:
    "Masdan didn’t get that — it’s busy right now. Send it again in a moment.",
  rateLimited: "That’s a lot at once. Wait a minute, then send it again.",
  tooLong: `Keep it to ${QUICK_ENTRY_MAX_LENGTH} characters, so nothing was added.`,
  unlinked: `This account isn’t linked to Masdan yet. ${WHERE_TO_LINK}`,
};

/** Reruns quick entry on the same text in the web app; tailnet-only, which is fine. */
export const quickEntryLink = (
  appUrl: string | null,
  text: string
): string | null => {
  if (!appUrl) {
    return null;
  }
  const url = new URL("/transactions", appUrl);
  url.searchParams.set("quickEntry", text);
  return url.toString();
};
