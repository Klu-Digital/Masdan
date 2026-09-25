import {
  cardProductName,
  findCardProduct,
} from "@masdan/api/card-products/catalog";
import { toNumber } from "@masdan/ui/lib/money";

import { daysBetween, nextDayOfMonth } from "@/lib/dates";

export interface CardStatement {
  dueDate: string | null;
  minimumAmountDue: string | null;
  periodEnd: string;
  periodStart: string;
  statementBalance: string;
  statementDate: string;
}

export type UtilizationTone = "positive" | "warning" | "danger";

/** Under 30% is healthy, 30–70% worth watching, above 70% a problem. */
export const utilizationTone = (utilization: number): UtilizationTone => {
  if (utilization >= 70) {
    return "danger";
  }
  if (utilization >= 30) {
    return "warning";
  }
  return "positive";
};

export interface PaymentDue {
  /** From an issued statement, or projected from the card's due day. */
  source: "statement" | "schedule";
  dueDate: string;
  daysLeft: number;
  statement: CardStatement | null;
}

/**
 * The next payment a card needs. An issued statement with a future (or very
 * recent) due date wins; otherwise the card's due day projects one.
 */
export const nextPaymentDue = (
  card: { balance: string; paymentDueDay: number | null },
  statements: CardStatement[],
  today: string
): PaymentDue | null => {
  const [latest] = statements;
  if (latest?.dueDate && daysBetween(today, latest.dueDate) >= -7) {
    return {
      daysLeft: daysBetween(today, latest.dueDate),
      dueDate: latest.dueDate,
      source: "statement",
      statement: latest,
    };
  }
  if (card.paymentDueDay && toNumber(card.balance) > 0) {
    const dueDate = nextDayOfMonth(card.paymentDueDay, today);
    return {
      daysLeft: daysBetween(today, dueDate),
      dueDate,
      source: "schedule",
      statement: null,
    };
  }
  return null;
};

/** A key the catalog no longer knows still reads as something. */
export const cardProductLabel = (key: string | null): string | null => {
  if (!key) {
    return null;
  }
  const product = findCardProduct(key);
  return product ? cardProductName(product) : "No longer in the catalog";
};
