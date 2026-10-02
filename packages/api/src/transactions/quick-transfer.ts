import type { z } from "zod";

import { transferValues } from "../transfers/schema";
import {
  parseAmount,
  resolveAccountText,
  resolveQuickEntry,
} from "./quick-entry";
import type {
  QuickEntryExtraction,
  QuickEntryHousehold,
  QuickEntryIssue,
  QuickEntryResult,
} from "./quick-entry";
import { CURRENCY_WORDS } from "./quick-entry.lexicon";

const TRANSFER_WORD = /\b(?:transfer|transferred|lipat|nilipat)\b/iu;
const DIRECTION = /\bfrom\s+(?<source>.+?)\s+to\s+(?<destination>.+)/iu;

export interface QuickTransferResult {
  input: z.output<typeof transferValues> | null;
  issues: {
    field:
      | QuickEntryIssue["field"]
      | "sourceAccountId"
      | "destinationAccountId"
      | "destinationAmount";
    message: string;
    reason: QuickEntryIssue["reason"];
  }[];
  kind: "transfer";
  prefill: QuickEntryResult["prefill"] & {
    destinationAccountId: string | null;
    destinationAmount: string | null;
    sourceAccountId: string | null;
    sourceAmount: string | null;
  };
}

// oxlint-disable-next-line complexity -- Transfer guards share the existing transaction amount and date scanner.
export const resolveQuickTransfer = (
  text: string,
  household: QuickEntryHousehold,
  extraction: QuickEntryExtraction | null
): QuickTransferResult | null => {
  if (!TRANSFER_WORD.test(text)) {
    return null;
  }
  const base = resolveQuickEntry(text, household, extraction);
  const issues: QuickTransferResult["issues"] = base.issues.filter((issue) =>
    ["amount", "transactionDate", "paidStatus"].includes(issue.field)
  );
  if (base.prefill.paidStatus === "unpaid") {
    issues.push({
      field: "paidStatus",
      message:
        "Transfers record money already moved — review this unpaid entry",
      reason: "conflict",
    });
  }
  const direction = DIRECTION.exec(text)?.groups;
  const accountId = (
    phrase: string | undefined,
    field: "sourceAccountId" | "destinationAccountId"
  ): string | null => {
    const match = resolveAccountText(phrase ?? "", household.accounts);
    if (match.status === "resolved") {
      return match.accountId;
    }
    issues.push({
      field,
      message: `Choose ${field === "sourceAccountId" ? "where the money comes from" : "where the money goes"}${match.status === "ambiguous" ? " — more than one account matches" : " (use from … to …)"}`,
      reason: match.status === "ambiguous" ? "ambiguous" : "missing",
    });
    return null;
  };
  const sourceAccountId = accountId(direction?.source, "sourceAccountId");
  const destinationAccountId = accountId(
    direction?.destination,
    "destinationAccountId"
  );
  const source = household.accounts.find(
    (account) => account.id === sourceAccountId
  );
  const destination = household.accounts.find(
    (account) => account.id === destinationAccountId
  );
  const currency =
    text
      .split(/\s+/u)
      .map(
        (token) =>
          parseAmount(token)?.currency ?? CURRENCY_WORDS[token.toLowerCase()]
      )
      .find(Boolean) ?? extraction?.currency?.toUpperCase();
  if (source && currency && source.currencyCode !== currency) {
    issues.push({
      field: "amount",
      message: `${source.name} is in ${source.currencyCode}, not ${currency}`,
      reason: "conflict",
    });
  }
  const sameCurrency =
    source && destination && source.currencyCode === destination.currencyCode;
  if (source && destination && !sameCurrency) {
    issues.push({
      field: "destinationAmount",
      message: `Enter the amount received in ${destination.currencyCode}`,
      reason: "missing",
    });
  }
  const prefill = {
    ...base.prefill,
    destinationAccountId,
    destinationAmount: sameCurrency ? base.prefill.amount : null,
    notes: text,
    sourceAccountId,
    sourceAmount: base.prefill.amount,
  };
  const parsed = transferValues.safeParse({
    destinationAccountId,
    destinationAmount: prefill.destinationAmount,
    notes: prefill.notes,
    sourceAccountId,
    sourceAmount: prefill.sourceAmount,
    transactionDate: prefill.transactionDate,
  });
  if (sourceAccountId && sourceAccountId === destinationAccountId) {
    issues.push({
      field: "destinationAccountId",
      message: "Choose two different accounts",
      reason: "invalid",
    });
  }
  return {
    input:
      extraction && issues.length === 0 && parsed.success ? parsed.data : null,
    issues,
    kind: "transfer",
    prefill,
  };
};
