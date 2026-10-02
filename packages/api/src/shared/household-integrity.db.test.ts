import {
  billPayment,
  category,
  categoryBudget,
  chatInboundMessage,
  creditCardReminder,
  creditCardStatement,
  file,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountInterest,
  financialAccountInterestRate,
  financialAccountOwner,
  financialTransaction,
  financialTransactionAttachment,
  financialTransactionSplit,
  financialTransactionTag,
  financialTransfer,
  interestCredit,
  member,
  organization,
  recurringSchedule,
  recurringScheduleTag,
  savingsGoal,
  tag,
  transactionImport,
  transactionImportRow,
  transactionRule,
  transactionRuleTag,
} from "@masdan/db/schema/index";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

// ADR 0002: the schema, not the procedures, keeps each household's rows apart.

const FOREIGN_KEY_VIOLATION = "23503";
const RESTRICT_VIOLATION = "23001";
const CHECK_VIOLATION = "23514";

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) {
    throw new Error("Seed insert returned no row");
  }
  return row;
};

const seedHousehold = async (label: string) => {
  const db = getTestDb();
  const { headers, user } = await signUpTestUser();
  const current = await getSessionFor(headers);
  const organizationId = current?.session.activeOrganizationId ?? "";
  const owner = one(
    await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, organizationId))
  );
  const account = {
    accountClass: "asset",
    accountType: "bank",
    currencyCode: "PHP",
    organizationId,
  } as const;
  const [bank, wallet] = await db
    .insert(financialAccount)
    .values([
      { ...account, name: `${label} Bank` },
      { ...account, name: `${label} Wallet` },
    ])
    .returning({ id: financialAccount.id });
  if (!(bank && wallet)) {
    throw new Error("Account seed failed");
  }
  const [expense, income] = await db
    .insert(category)
    .values([
      {
        color: "red",
        icon: "tag",
        name: `${label} Groceries`,
        organizationId,
        type: "expense",
      },
      {
        color: "green",
        icon: "tag",
        name: `${label} Salary`,
        organizationId,
        type: "income",
      },
    ])
    .returning({ id: category.id });
  if (!(expense && income)) {
    throw new Error("Category seed failed");
  }
  const trip = one(
    await db
      .insert(tag)
      .values({ color: "blue", name: `${label} Trip`, organizationId })
      .returning({ id: tag.id })
  );
  const posting = one(
    await db
      .insert(financialTransaction)
      .values({
        accountId: bank.id,
        amount: "250",
        categoryId: expense.id,
        currencyCode: "PHP",
        organizationId,
        transactionDate: "2026-09-01",
      })
      .returning({ id: financialTransaction.id })
  );
  const transfer = one(
    await db
      .insert(financialTransfer)
      .values({
        destinationAccountId: wallet.id,
        destinationAmount: "100",
        organizationId,
        sourceAccountId: bank.id,
        sourceAmount: "100",
        transactionDate: "2026-09-02",
      })
      .returning({ id: financialTransfer.id })
  );
  const schedule = one(
    await db
      .insert(recurringSchedule)
      .values({
        accountId: bank.id,
        amount: "1500",
        categoryId: expense.id,
        frequency: "monthly",
        name: `${label} Rent`,
        nextOccurrenceDate: "2026-10-01",
        organizationId,
        startDate: "2026-10-01",
      })
      .returning({ id: recurringSchedule.id })
  );
  const rule = one(
    await db
      .insert(transactionRule)
      .values({
        matchText: "grab",
        matchTextOperator: "contains",
        name: `${label} Rides`,
        organizationId,
        position: 0,
      })
      .returning({ id: transactionRule.id })
  );
  const upload = one(
    await db
      .insert(file)
      .values({
        bucket: "test-bucket",
        contentType: "image/jpeg",
        key: `${organizationId}/${label}.jpg`,
        name: `${label}.jpg`,
        organizationId,
        userId: user.id,
      })
      .returning({ id: file.id })
  );
  const csvImport = one(
    await db
      .insert(transactionImport)
      .values({
        accountId: bank.id,
        defaultExpenseCategoryId: expense.id,
        defaultIncomeCategoryId: income.id,
        fileName: `${label}.csv`,
        mapping: {},
        openingBalanceMode: "reject",
        organizationId,
        status: "ready",
      })
      .returning({ id: transactionImport.id })
  );
  const statement = one(
    await db
      .insert(creditCardStatement)
      .values({
        accountId: wallet.id,
        organizationId,
        periodEnd: "2026-08-31",
        periodStart: "2026-08-01",
        statementBalance: "0",
        statementDate: "2026-09-01",
      })
      .returning({ id: creditCardStatement.id })
  );
  return {
    bank,
    csvImport,
    expense,
    file: upload,
    organizationId,
    owner,
    posting,
    rule,
    schedule,
    statement,
    tag: trip,
    transfer,
    wallet,
  };
};

type Household = Awaited<ReturnType<typeof seedHousehold>>;

/** The Postgres error behind drizzle's wrapper, or a failure if the write went through. */
const rejection = async (
  write: PromiseLike<unknown>
): Promise<{ code?: string; constraint?: string }> => {
  try {
    await write;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return (cause ?? error) as { code?: string; constraint?: string };
  }
  throw new Error("The database accepted the write");
};

let home: Household;
let away: Household;

beforeEach(async () => {
  home = await seedHousehold("Home");
  away = await seedHousehold("Away");
});

const crossHouseholdWrites: [string, () => PromiseLike<unknown>][] = [
  [
    "financial_transaction_account_id_fkey",
    () =>
      getTestDb().insert(financialTransaction).values({
        accountId: away.bank.id,
        amount: "10",
        categoryId: home.expense.id,
        currencyCode: "PHP",
        organizationId: home.organizationId,
        transactionDate: "2026-09-03",
      }),
  ],
  [
    "financial_transaction_category_id_fkey",
    () =>
      getTestDb().insert(financialTransaction).values({
        accountId: home.bank.id,
        amount: "10",
        categoryId: away.expense.id,
        currencyCode: "PHP",
        organizationId: home.organizationId,
        transactionDate: "2026-09-03",
      }),
  ],
  [
    "financial_transaction_split_category_id_fkey",
    () =>
      getTestDb().insert(financialTransactionSplit).values({
        amount: "10",
        categoryId: away.expense.id,
        organizationId: home.organizationId,
        sortOrder: 0,
        transactionId: home.posting.id,
      }),
  ],
  [
    "financial_transaction_tag_tag_id_fkey",
    () =>
      getTestDb().insert(financialTransactionTag).values({
        organizationId: home.organizationId,
        tagId: away.tag.id,
        transactionId: home.posting.id,
      }),
  ],
  [
    "financial_transaction_attachment_file_id_fkey",
    () =>
      getTestDb().insert(financialTransactionAttachment).values({
        fileId: away.file.id,
        organizationId: home.organizationId,
        transactionId: home.posting.id,
      }),
  ],
  [
    "financial_transfer_destination_account_id_fkey",
    () =>
      getTestDb().insert(financialTransfer).values({
        destinationAccountId: away.bank.id,
        destinationAmount: "10",
        organizationId: home.organizationId,
        sourceAccountId: home.bank.id,
        sourceAmount: "10",
        transactionDate: "2026-09-03",
      }),
  ],
  [
    "recurring_schedule_category_id_fkey",
    () =>
      getTestDb().insert(recurringSchedule).values({
        accountId: home.bank.id,
        amount: "10",
        categoryId: away.expense.id,
        frequency: "monthly",
        name: "Stray",
        nextOccurrenceDate: "2026-10-01",
        organizationId: home.organizationId,
        startDate: "2026-10-01",
      }),
  ],
  [
    "recurring_schedule_tag_tag_id_fkey",
    () =>
      getTestDb().insert(recurringScheduleTag).values({
        organizationId: home.organizationId,
        scheduleId: home.schedule.id,
        tagId: away.tag.id,
      }),
  ],
  [
    "transaction_rule_set_category_id_fkey",
    () =>
      getTestDb().insert(transactionRule).values({
        matchText: "grab",
        matchTextOperator: "contains",
        name: "Stray",
        organizationId: home.organizationId,
        position: 1,
        setCategoryId: away.expense.id,
      }),
  ],
  [
    "transaction_rule_tag_tag_id_fkey",
    () =>
      getTestDb().insert(transactionRuleTag).values({
        organizationId: home.organizationId,
        ruleId: home.rule.id,
        tagId: away.tag.id,
      }),
  ],
  [
    "category_budget_category_id_fkey",
    () =>
      getTestDb().insert(categoryBudget).values({
        amount: "5000",
        categoryId: away.expense.id,
        currencyCode: "PHP",
        month: "2026-09-01",
        organizationId: home.organizationId,
      }),
  ],
  [
    "savings_goal_account_id_fkey",
    () =>
      getTestDb().insert(savingsGoal).values({
        accountId: away.bank.id,
        name: "Stray",
        organizationId: home.organizationId,
        targetAmount: "1000",
      }),
  ],
  [
    "bill_payment_transaction_id_fkey",
    () =>
      getTestDb().insert(billPayment).values({
        dueDate: "2026-10-01",
        kind: "recurring",
        organizationId: home.organizationId,
        scheduleId: home.schedule.id,
        transactionId: away.posting.id,
      }),
  ],
  [
    "credit_card_statement_account_id_fkey",
    () =>
      getTestDb().insert(creditCardStatement).values({
        accountId: away.wallet.id,
        organizationId: home.organizationId,
        periodEnd: "2026-09-30",
        periodStart: "2026-09-01",
        statementBalance: "0",
        statementDate: "2026-10-01",
      }),
  ],
  [
    "credit_card_reminder_statement_id_fkey",
    () =>
      getTestDb().insert(creditCardReminder).values({
        accountId: home.wallet.id,
        eventDate: "2026-10-15",
        kind: "payment",
        organizationId: home.organizationId,
        paymentsAfter: "2026-09-01",
        statementId: away.statement.id,
      }),
  ],
  [
    "transaction_import_account_id_fkey",
    () =>
      getTestDb().insert(transactionImport).values({
        accountId: away.bank.id,
        defaultExpenseCategoryId: home.expense.id,
        defaultIncomeCategoryId: home.expense.id,
        fileName: "stray.csv",
        mapping: {},
        openingBalanceMode: "reject",
        organizationId: home.organizationId,
        status: "ready",
      }),
  ],
  [
    "transaction_import_row_transaction_id_fkey",
    () =>
      getTestDb().insert(transactionImportRow).values({
        importId: home.csvImport.id,
        organizationId: home.organizationId,
        raw: [],
        rowNumber: 2,
        status: "imported",
        transactionId: away.posting.id,
      }),
  ],
  [
    "financial_account_owner_member_id_fkey",
    () =>
      getTestDb().insert(financialAccountOwner).values({
        financialAccountId: home.bank.id,
        memberId: away.owner.id,
        organizationId: home.organizationId,
      }),
  ],
  [
    "financial_account_balance_snapshot_account_id_fkey",
    () =>
      getTestDb().insert(financialAccountBalanceSnapshot).values({
        accountId: away.bank.id,
        balance: "0",
        effectiveDate: "2026-09-01",
        organizationId: home.organizationId,
      }),
  ],
  [
    "financial_account_interest_account_id_fkey",
    () =>
      getTestDb().insert(financialAccountInterest).values({
        accountId: away.bank.id,
        organizationId: home.organizationId,
      }),
  ],
  [
    "financial_account_interest_rate_account_id_fkey",
    () =>
      getTestDb().insert(financialAccountInterestRate).values({
        accountId: away.bank.id,
        effectiveFrom: "2026-09-01",
        followsPreset: true,
        organizationId: home.organizationId,
      }),
  ],
  [
    "interest_credit_account_id_fkey",
    () =>
      getTestDb().insert(interestCredit).values({
        accountId: away.bank.id,
        creditDate: "2026-09-30",
        gross: "1",
        net: "0.8",
        organizationId: home.organizationId,
        periodEnd: "2026-09-30",
        periodStart: "2026-09-01",
        tax: "0.2",
        transactionId: null,
      }),
  ],
  [
    "interest_credit_transaction_id_fkey",
    () =>
      getTestDb().insert(interestCredit).values({
        accountId: home.bank.id,
        creditDate: "2026-09-30",
        gross: "1",
        net: "0.8",
        organizationId: home.organizationId,
        periodEnd: "2026-09-30",
        periodStart: "2026-09-01",
        tax: "0.2",
        transactionId: away.posting.id,
      }),
  ],
  [
    "chat_inbound_message_transaction_id_fkey",
    () =>
      getTestDb().insert(chatInboundMessage).values({
        channel: "telegram",
        messageId: "1",
        organizationId: home.organizationId,
        processedAt: new Date(),
        transactionId: away.posting.id,
      }),
  ],
];

describe("household integrity", () => {
  it.each(crossHouseholdWrites)(
    "%s rejects a reference into another household",
    async (constraint, write) => {
      expect(await rejection(write())).toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint,
      });
    }
  );

  it("refuses to delete a category that has postings", async () => {
    const dining = one(
      await getTestDb()
        .insert(category)
        .values({
          color: "orange",
          icon: "tag",
          name: "Dining",
          organizationId: home.organizationId,
          type: "expense",
        })
        .returning({ id: category.id })
    );
    await getTestDb().insert(financialTransaction).values({
      accountId: home.bank.id,
      amount: "80",
      categoryId: dining.id,
      currencyCode: "PHP",
      organizationId: home.organizationId,
      transactionDate: "2026-09-04",
    });

    expect(
      await rejection(
        getTestDb().delete(category).where(eq(category.id, dining.id))
      )
    ).toMatchObject({
      code: RESTRICT_VIOLATION,
      constraint: "financial_transaction_category_id_fkey",
    });
  });

  it("refuses to delete an account that has postings", async () => {
    await getTestDb()
      .delete(financialTransfer)
      .where(eq(financialTransfer.id, home.transfer.id));
    await getTestDb()
      .delete(recurringSchedule)
      .where(eq(recurringSchedule.id, home.schedule.id));
    await getTestDb()
      .delete(transactionImport)
      .where(eq(transactionImport.id, home.csvImport.id));

    expect(
      await rejection(
        getTestDb()
          .delete(financialAccount)
          .where(eq(financialAccount.id, home.bank.id))
      )
    ).toMatchObject({
      code: RESTRICT_VIOLATION,
      constraint: "financial_transaction_account_id_fkey",
    });
  });

  it("refuses to delete a tag still on a transaction", async () => {
    await getTestDb().insert(financialTransactionTag).values({
      organizationId: home.organizationId,
      tagId: home.tag.id,
      transactionId: home.posting.id,
    });

    expect(
      await rejection(getTestDb().delete(tag).where(eq(tag.id, home.tag.id)))
    ).toMatchObject({
      code: RESTRICT_VIOLATION,
      constraint: "financial_transaction_tag_tag_id_fkey",
    });
  });

  it.each(["0", "-1"])("rejects a %s transaction amount", async (amount) => {
    expect(
      await rejection(
        getTestDb()
          .update(financialTransaction)
          .set({ amount })
          .where(eq(financialTransaction.id, home.posting.id))
      )
    ).toMatchObject({
      code: CHECK_VIOLATION,
      constraint: "financial_transaction_positive_amount_chk",
    });
  });

  it("still deletes a whole household, leaving the other untouched", async () => {
    await getTestDb().insert(financialTransactionTag).values({
      organizationId: home.organizationId,
      tagId: home.tag.id,
      transactionId: home.posting.id,
    });
    await getTestDb()
      .delete(organization)
      .where(eq(organization.id, home.organizationId));

    const postingsOf = async (organizationId: string) =>
      one(
        await getTestDb()
          .select({ total: count() })
          .from(financialTransaction)
          .where(eq(financialTransaction.organizationId, organizationId))
      ).total;
    expect(await postingsOf(home.organizationId)).toBe(0);
    expect(await postingsOf(away.organizationId)).toBe(1);
  });
});
