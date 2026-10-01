import { Faker, en } from "@faker-js/faker";
import { cardCatalog } from "@masdan/card-catalog/all";
import { getSessionFor, getTestDb, signUpTestUser } from "@masdan/testing";
import { eq } from "drizzle-orm";
import { expect, it } from "vite-plus/test";

import { getAccountBalances } from "../../../../../api/src/accounts/balances";
import { category } from "../../../schema/categories";
import {
  creditCardStatement,
  financialAccount,
  financialAccountOwner,
} from "../../../schema/financial-accounts";
import { tag } from "../../../schema/tags";
import {
  financialTransaction,
  financialTransactionTag,
} from "../../../schema/transactions";
import { seedFinances } from "./finances";

it.each([22, 99])(
  "seeds preset accounts and a varied PHP ledger worth around 2.5 million (seed %i)",
  async (seed) => {
    const db = getTestDb();
    const user = await signUpTestUser();
    const session = await getSessionFor(user.headers);
    const householdId = session?.session.activeOrganizationId;
    if (!householdId) {
      throw new Error("Test user has no active household");
    }
    const faker = new Faker({ locale: en });
    faker.seed(seed);
    await seedFinances(db, user.user.id, faker);

    const accounts = await db
      .select()
      .from(financialAccount)
      .where(eq(financialAccount.organizationId, householdId));
    expect(accounts).toHaveLength(7);
    expect(
      accounts
        .filter((account) => account.accountClass === "asset")
        .every((account) => account.institutionId !== null)
    ).toBe(true);
    const cards = accounts.filter(
      (account) => account.accountType === "credit_card"
    );
    expect(cards.map((account) => account.cardProductKey).toSorted()).toEqual([
      "ph-hsbc-live-plus-visa-signature",
      "ph-metrobank-world-mastercard",
      "ph-rcbc-black-card-platinum-mastercard",
      "ph-zed-titanium-mastercard",
    ]);
    for (const card of cards) {
      expect(cardCatalog.findProduct(card.cardProductKey)).not.toBeNull();
    }
    const balances = await getAccountBalances(
      db,
      householdId,
      accounts.map((account) => account.id)
    );
    const netWorth = accounts.reduce(
      (sum, account) =>
        sum +
        (account.accountClass === "asset" ? 1 : -1) *
          Number(balances.get(account.id)),
      0
    );
    expect(netWorth).toBeGreaterThanOrEqual(2_425_000);
    expect(netWorth).toBeLessThanOrEqual(2_575_000);
    expect(netWorth).not.toBe(2_500_000);
    expect(
      accounts.every((account) => Number(balances.get(account.id)) > 0)
    ).toBe(true);
    const owners = await db
      .select()
      .from(financialAccountOwner)
      .where(eq(financialAccountOwner.organizationId, householdId));
    expect(owners).toHaveLength(7);
    const categories = await db
      .select()
      .from(category)
      .where(eq(category.organizationId, householdId));
    const tags = await db
      .select()
      .from(tag)
      .where(eq(tag.organizationId, householdId));
    const transactions = await db
      .select()
      .from(financialTransaction)
      .where(eq(financialTransaction.organizationId, householdId));
    const transactionTags = await db
      .select()
      .from(financialTransactionTag)
      .where(eq(financialTransactionTag.organizationId, householdId));
    expect(categories).toHaveLength(16);
    expect(tags).toHaveLength(12);
    expect(new Set(transactions.map((row) => row.categoryId)).size).toBe(17);
    expect(new Set(transactions.map((row) => row.notes)).size).toBeGreaterThan(
      45
    );
    expect(transactionTags.length).toBeGreaterThan(transactions.length);
    expect(
      transactions.every(
        (row) => row.transactionDate <= new Date().toISOString().slice(0, 10)
      )
    ).toBe(true);
    const statements = await db
      .select()
      .from(creditCardStatement)
      .where(eq(creditCardStatement.organizationId, householdId));
    expect(statements).toHaveLength(44);
    for (const card of cards) {
      const [latest] = statements
        .filter((row) => row.accountId === card.id)
        .toSorted((left, right) =>
          right.statementDate.localeCompare(left.statementDate)
        );
      expect(latest).toBeDefined();
      const balance = await getAccountBalances(
        db,
        householdId,
        [card.id],
        latest?.periodEnd
      );
      expect(Number(balance.get(card.id))).toBe(
        Number(latest?.statementBalance)
      );
      expect(Number(balances.get(card.id))).toBeLessThan(
        Number(card.creditLimit)
      );
    }
  }
);
