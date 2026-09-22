import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { CreditCardSummary } from "./credit-card-summary";

const account = {
  availableCredit: "77000.000000",
  balance: "23000.000000",
  creditLimit: "100000.000000",
  currencyCode: "PHP",
  utilization: "23.00",
};

const statement = {
  accountId: "account-1",
  createdAt: new Date("2026-01-25T00:00:00Z"),
  dueDate: "2026-02-15",
  id: "statement-1",
  minimumAmountDue: "1000.000000",
  organizationId: "household-1",
  periodEnd: "2026-01-25",
  periodStart: "2025-12-26",
  statementBalance: "23000.000000",
  statementDate: "2026-01-25",
  updatedAt: new Date("2026-01-25T00:00:00Z"),
};

describe("CreditCardSummary", () => {
  it("shows current utilization and statement history", () => {
    render(<CreditCardSummary account={account} statements={[statement]} />);

    expect(screen.getAllByText("₱23,000")).toHaveLength(2);
    expect(screen.getByText("₱77,000")).toBeInTheDocument();
    expect(screen.getByText("23.00%")).toBeInTheDocument();
    expect(screen.getByText("2025-12-26 – 2026-01-25")).toBeInTheDocument();
    expect(screen.getByText("₱1,000")).toBeInTheDocument();
    expect(screen.getByText("2026-02-15")).toBeInTheDocument();
  });

  it("handles cards without a usable credit limit or statements", () => {
    render(
      <CreditCardSummary
        account={{
          ...account,
          availableCredit: "0.000000",
          creditLimit: "0.000000",
          utilization: null,
        }}
        statements={[]}
      />
    );

    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText("No statements yet")).toBeInTheDocument();
  });
});
