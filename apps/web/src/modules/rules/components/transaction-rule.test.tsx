import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

vi.mock("@/hooks/use-household", () => ({
  useHousehold: () => ({ activeOrganizationId: "household-1" }),
}));

const rpc = vi.hoisted(() => ({
  accounts: vi.fn(),
  apply: vi.fn(),
  match: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: rpc.accounts },
      rules: {
        applyToTransaction: rpc.apply,
        matchTransaction: rpc.match,
      },
    }),
  };
});

const { TransactionRule } = await import("./transaction-rule");

const TRANSACTION = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "00000000-0000-4000-8000-000000000002";
const RULE = "00000000-0000-4000-8000-000000000003";

const conditions = {
  accountId: ACCOUNT,
  amountMax: null,
  amountMin: null,
  text: { operator: "contains" as const, value: "grab" },
  type: "expense" as const,
};

const rule = {
  actions: { categoryId: "transport", tagIds: ["commute"] },
  category: { name: "Transport" },
  conditions,
  enabled: true,
  id: RULE,
  name: "Grab rides",
  position: 0,
  problem: null,
  tags: [{ id: "commute", name: "Commute" }],
};

const transaction = {
  archivedAt: null,
  id: TRANSACTION,
  ruleApplication: null,
  splits: [],
  transfer: null,
};

const renderRule = (overrides: Record<string, unknown> = {}, canApply = true) =>
  renderWithProviders(
    <TransactionRule
      canApply={canApply}
      transaction={{ ...transaction, ...overrides }}
    />
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.accounts.mockResolvedValue([
    { archivedAt: null, id: ACCOUNT, name: "BPI Savings" },
  ]);
  rpc.match.mockResolvedValue({
    eligibility: null,
    match: {
      addedTagIds: ["commute"],
      categoryChanges: true,
      checks: [
        { field: "description", matched: true },
        { field: "type", matched: true },
        { field: "account", matched: true },
      ],
      rule,
    },
  });
  rpc.apply.mockResolvedValue({
    ruleApplication: { ruleName: "Grab rides" },
  });
});

describe("TransactionRule", () => {
  it("previews the matching rule with its reasons and applies it on request", async () => {
    const user = userEvent.setup();
    renderRule();

    expect(await screen.findByText("Grab rides")).toBeVisible();
    expect(screen.getByText("Description contains “grab”")).toBeVisible();
    expect(await screen.findByText("Account is BPI Savings")).toBeVisible();
    expect(screen.getByText("Sets Transport · Adds Commute")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply rule" }));
    await waitFor(() =>
      expect(rpc.apply).toHaveBeenCalledWith({
        ruleId: RULE,
        transactionId: TRANSACTION,
      })
    );
  });

  it("explains which rule set a transaction, even with nothing left to apply", async () => {
    rpc.match.mockResolvedValue({
      eligibility: null,
      match: {
        addedTagIds: [],
        categoryChanges: false,
        checks: [],
        rule,
      },
    });
    renderRule({
      ruleApplication: {
        categoryId: "transport",
        conditions,
        ruleId: RULE,
        ruleName: "Grab rides",
        tagIds: ["commute"],
      },
    });

    expect(await screen.findByText("Grab rides")).toBeVisible();
    expect(screen.getByText(/Set by rule/u)).toBeVisible();
    expect(screen.getByText("Description contains “grab”")).toBeVisible();
    await waitFor(() => expect(rpc.match).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Apply rule" })
    ).not.toBeInTheDocument();
  });

  it("offers no apply button without permission to edit", async () => {
    renderRule({}, false);
    expect(await screen.findByText("Grab rides")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Apply rule" })
    ).not.toBeInTheDocument();
  });

  it("stays out of the way for split transactions and transfers", () => {
    const split = renderRule({ splits: [{ id: "split-1" }] });
    expect(screen.queryByRole("region", { name: "Rules" })).toBeNull();
    split.unmount();
    renderRule({ transfer: { id: "transfer-1" } });
    expect(screen.queryByRole("region", { name: "Rules" })).toBeNull();
    expect(rpc.match).not.toHaveBeenCalled();
  });
});
