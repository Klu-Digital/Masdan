import {
  REMINDER_LEAD_DAYS,
  reminderCandidates,
  reminderResolution,
} from "@masdan/api/reminders/reminder-rules";
import { daysBetween } from "@masdan/api/reports/periods";

import type { RouterOutputs } from "@/utils/orpc";

import { today } from "../flows";
import { balanceOf } from "../ledger";
import type { Section } from "../router";
import { db } from "../store";
import type { Account } from "../store";
import { newId, notFound, scaled, sum, text } from "../util";

type Reminder = RouterOutputs["reminders"]["list"]["items"][number];

// One id per card, kind and day for as long as the tab lives.
const idFor = (key: string): string => {
  const { reminderIds } = db();
  const id = reminderIds.get(key) ?? newId();
  reminderIds.set(key, id);
  return id;
};

const latestStatement = (card: Account) =>
  db()
    .statements.filter((row) => row.accountId === card.id)
    .toSorted((a, b) => b.statementDate.localeCompare(a.statementDate))[0] ??
  null;

const paidAfter = (card: Account, after: string | null): string =>
  text(
    after === null
      ? 0n
      : sum(
          db()
            .transactions.filter(
              (row) =>
                row.accountId === card.id &&
                row.transferSide === "destination" &&
                row.archivedAt === null &&
                row.transactionDate > after
            )
            .map((row) => row.amount)
        )
  );

/** What the worker would have stored, judged the way `reminders.list` judges it. */
const activeReminders = (): (Reminder & { key: string })[] => {
  const day = today();
  const items: (Reminder & { key: string })[] = [];
  for (const card of db().accounts.filter(
    (row) => row.accountType === "credit_card"
  )) {
    const balance = text(balanceOf(card));
    const facts = {
      archived: card.archivedAt !== null,
      balance,
      paymentDueDay: card.paymentDueDay,
      statementClosingDay: card.statementClosingDay,
    };
    const latest = latestStatement(card);
    for (const candidate of reminderCandidates(facts, latest, day)) {
      const statement =
        db().statements.find((row) => row.id === candidate.statementId) ?? null;
      const paidAmount = paidAfter(card, candidate.paymentsAfter);
      const daysLeft = daysBetween(day, candidate.eventDate);
      const resolution = reminderResolution(candidate, {
        card: facts,
        latest,
        paidAmount,
        statement,
        today: day,
      });
      if (resolution !== null || daysLeft > REMINDER_LEAD_DAYS) {
        continue;
      }
      const payment = candidate.kind === "payment";
      const minimum = statement?.minimumAmountDue ?? null;
      const key = `${card.id}:${candidate.kind}:${candidate.eventDate}`;
      items.push({
        account: {
          cardLastFour: card.cardLastFour,
          cardNetwork: card.cardNetwork,
          cardProductKey: card.cardProductKey,
          color: card.color,
          currencyCode: card.currencyCode,
          icon: card.icon,
          id: card.id,
          institution: card.institution,
          name: card.name,
        },
        balance,
        daysLeft,
        eventDate: candidate.eventDate,
        id: idFor(key),
        key,
        kind: candidate.kind,
        minimumAmountDue: minimum,
        minimumPaid:
          payment &&
          minimum !== null &&
          scaled(minimum) > 0n &&
          scaled(paidAmount) >= scaled(minimum),
        paidAmount: payment ? paidAmount : null,
        source: statement ? "statement" : "card",
        statementBalance: statement?.statementBalance ?? null,
      });
    }
  }
  return items.toSorted((a, b) => a.eventDate.localeCompare(b.eventDate));
};

const transition = (reminderId: string, dismissed: boolean) => {
  const reminder = activeReminders().find((row) => row.id === reminderId);
  if (!reminder) {
    throw notFound("Reminder");
  }
  if (dismissed) {
    db().dismissedReminders.add(reminder.key);
  } else {
    db().dismissedReminders.delete(reminder.key);
  }
  return {
    id: reminderId,
    status: dismissed ? "dismissed" : "active",
  } as const;
};

export const reminders: Section<"reminders"> = {
  dismiss: ({ reminderId }) => transition(reminderId, true),

  list: () => ({
    items: activeReminders()
      .filter((row) => !db().dismissedReminders.has(row.key))
      .map(({ key: _key, ...row }) => row),
    today: today(),
  }),

  restore: ({ reminderId }) => transition(reminderId, false),
};
