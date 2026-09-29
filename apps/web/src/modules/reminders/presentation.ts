import { fixedAmountText, signedScaledAmount } from "@masdan/api/shared/money";
import { formatMoney } from "@masdan/ui/lib/money";

import { formatRelativeDays, formatShortDate } from "@/lib/dates";

import type { Reminder } from "./queries";

export type ReminderTone = "default" | "warning" | "danger";

export interface ReminderCopy {
  /** A short status chip, e.g. "Overdue" or "Minimum paid". */
  badge: string | null;
  /** The amount line, when there is one worth saying. */
  detail: string | null;
  title: string;
  tone: ReminderTone;
}

/** A payment this close reads as a warning even before it is late. */
const PAYMENT_WARNING_DAYS = 2;

const whenText = (reminder: Reminder, today: string): string =>
  `${formatShortDate(reminder.eventDate, today)} · ${formatRelativeDays(reminder.eventDate, today)}`;

const statementCopy = (reminder: Reminder, today: string): ReminderCopy => {
  if (reminder.daysLeft < 0) {
    return {
      badge: "Record statement",
      detail: `Closed ${whenText(reminder, today)}`,
      title: "Statement closed",
      tone: "warning",
    };
  }
  return {
    badge: null,
    detail: `Closes ${whenText(reminder, today)}`,
    title:
      reminder.daysLeft === 0 ? "Statement closes today" : "Statement closing",
    tone: "default",
  };
};

type MoneyText = (value: string, currency: string) => string;

const paymentAmount = (reminder: Reminder, money: MoneyText): string => {
  const currency = reminder.account.currencyCode;
  if (reminder.statementBalance === null) {
    return `About ${money(reminder.balance, currency)} owed · from the card’s due day`;
  }
  const paid = signedScaledAmount(reminder.paidAmount ?? "0");
  if (paid <= 0n) {
    return `${money(reminder.statementBalance, currency)} statement balance`;
  }
  const left = signedScaledAmount(reminder.statementBalance) - paid;
  return `${money(fixedAmountText(left), currency)} left of ${money(reminder.statementBalance, currency)}`;
};

const paymentCopy = (
  reminder: Reminder,
  today: string,
  money: MoneyText
): ReminderCopy => {
  const minimumBadge = reminder.minimumPaid ? "Minimum paid" : null;
  const detail = `${paymentAmount(reminder, money)} · due ${whenText(reminder, today)}`;
  if (reminder.daysLeft < 0) {
    return {
      badge: minimumBadge ?? "Overdue",
      detail,
      title: "Payment overdue",
      tone: "danger",
    };
  }
  return {
    badge: minimumBadge,
    detail,
    title: reminder.daysLeft === 0 ? "Payment due today" : "Payment due",
    tone: reminder.daysLeft <= PAYMENT_WARNING_DAYS ? "warning" : "default",
  };
};

/** `money` lets privacy mode swap the figures without losing the words. */
export const reminderCopy = (
  reminder: Reminder,
  today: string,
  money: MoneyText = formatMoney
): ReminderCopy =>
  reminder.kind === "statement"
    ? statementCopy(reminder, today)
    : paymentCopy(reminder, today, money);

/** Overdue first, then the most urgent tone, for the trigger's dot. */
export const strongestTone = (
  reminders: Reminder[],
  today: string
): ReminderTone | null => {
  const tones = new Set(
    reminders.map((reminder) => reminderCopy(reminder, today).tone)
  );
  if (tones.has("danger")) {
    return "danger";
  }
  if (tones.has("warning")) {
    return "warning";
  }
  return reminders.length > 0 ? "default" : null;
};
