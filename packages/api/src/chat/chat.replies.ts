import { formatDisplayMoney } from "../shared/money";
import type { QuickEntryKind } from "../transactions/quick-entry";
import { QUICK_ENTRY_MAX_LENGTH } from "../transactions/quick-entry";
import type { ReceiptEntryResult } from "../transactions/receipt-entry";

// Plain text only: nothing a user typed can become markup.

const EXAMPLE = "“dinner at jollibee 400 metrobank mc”";
const WHERE_TO_LINK =
  "In Masdan, open Settings → Household → Chat apps, make a code, then send /link followed by the code here.";

const finishIn = (link: string | null): string =>
  link ? `\n\nFinish it in Masdan: ${link}` : "";

const formatAmount = (amount: string, currencyCode: string): string =>
  formatDisplayMoney(amount, currencyCode, "en-PH", true);

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
  help: `Send a transaction like ${EXAMPLE}, or send a receipt photo with an optional caption naming the account or a note.\n\nNot linked yet? ${WHERE_TO_LINK}`,
  linkFailed:
    "That code didn’t work. Codes work once and expire after 10 minutes — make a new one in Masdan under Settings → Household → Chat apps.",
  linkRateLimited:
    "Too many link attempts. Wait 10 minutes, then send /link with a fresh code.",
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
  receiptAiFailed:
    "I couldn’t read that receipt right now. Nothing was added; try again.",
  receiptAttachFailed:
    "I couldn’t attach the receipt. Nothing was added; try again.",
  receiptCreated: (input: {
    amount: string;
    currencyCode: string;
    kind: QuickEntryKind;
    notes: string | null;
    accountName: string;
  }) => `${chatReplies.created(input)}\nReceipt attached`,
  receiptDownloadFailed: "I couldn’t download that receipt. Send it again.",
  receiptNeedsReview: (
    summary: ReceiptEntryResult["summary"],
    issues: ReceiptEntryResult["issues"],
    appUrl: string | null
  ) => {
    const found = [
      summary.merchant,
      summary.amount &&
        formatAmount(summary.amount, summary.currencyCode ?? "PHP"),
      summary.transactionDate &&
        new Date(`${summary.transactionDate}T00:00:00Z`).toLocaleDateString(
          "en-US",
          { day: "numeric", month: "short", timeZone: "UTC" }
        ),
    ].filter(Boolean);
    const labels: Record<string, string> = {
      accountId: "payment account",
      amount: "total",
      categoryId: "category",
      transactionDate: "date",
    };
    const missing = unique(
      issues
        .filter((issue) => issue.reason === "missing")
        .map((issue) => labels[issue.field] ?? issue.field)
    );
    return [
      found.length ? `I found:\n${found.join(" · ")}` : null,
      missing.length ? `Missing: ${missing.join(", ")}` : null,
      ...unique(
        issues
          .filter((issue) => issue.reason !== "missing")
          .map((issue) => `• ${issue.message}`)
      ),
      "Send the receipt again with a caption like “metrobank mc”.",
      appUrl ? `Add it in Masdan: ${new URL("/transactions", appUrl)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  },
  receiptTooLarge: "That receipt is too large. Send a smaller image.",
  receiptUnavailable:
    "Receipt entry isn’t available right now. Nothing was added.",
  receiptUnsupported:
    "Send a receipt photo or JPEG, PNG or WebP image. PDFs aren’t supported yet.",
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
