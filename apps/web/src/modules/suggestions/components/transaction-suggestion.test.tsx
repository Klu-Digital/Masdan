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

const enabled = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/hooks/use-feature-flag", () => ({ useFeatureFlag: enabled }));

const rpc = vi.hoisted(() => ({
  accept: vi.fn(),
  categories: vi.fn(),
  suggest: vi.fn(),
  tags: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      categories: { list: rpc.categories },
      suggestions: {
        acceptForTransaction: rpc.accept,
        forTransaction: rpc.suggest,
      },
      tags: { list: rpc.tags },
    }),
  };
});

const { TransactionSuggestion } = await import("./transaction-suggestion");

const TRANSACTION = "00000000-0000-4000-8000-000000000001";

const transaction = {
  archivedAt: null,
  categoryId: "groceries",
  id: TRANSACTION,
  notes: "Grab ride to the office",
  splits: [],
  suggestionApplication: null,
  tags: [],
  transfer: null,
  type: "expense",
};

/** The sentinel proves the router rendered, even when the section is empty. */
const renderSuggestion = (
  overrides: Record<string, unknown> = {},
  canAccept = true
) =>
  renderWithProviders(
    <>
      <span>rendered</span>
      <TransactionSuggestion
        canAccept={canAccept}
        transaction={
          { ...transaction, ...overrides } as Parameters<
            typeof TransactionSuggestion
          >[0]["transaction"]
        }
      />
    </>
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  enabled.mockReturnValue(true);
  rpc.categories.mockResolvedValue([
    {
      archivedAt: null,
      color: "blue",
      icon: "🚕",
      id: "transport",
      name: "Transport",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "green",
      icon: "🛒",
      id: "groceries",
      name: "Groceries",
      type: "expense",
    },
  ]);
  rpc.tags.mockResolvedValue([
    { archivedAt: null, color: "sky", id: "work", name: "Work" },
  ]);
});

describe("TransactionSuggestion", () => {
  it("changes nothing until the user accepts, then sends what they kept", async () => {
    rpc.suggest.mockResolvedValue({
      status: "suggested",
      suggested: { categoryId: "transport", tagIds: ["work"] },
    });
    rpc.accept.mockResolvedValue({});
    const user = userEvent.setup();
    renderSuggestion();

    await user.click(
      await screen.findByRole("button", { name: "Suggest a category" })
    );
    expect(
      await screen.findByRole("combobox", { name: "Suggested category" })
    ).toHaveValue("Transport");
    expect(rpc.accept).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(rpc.accept).toHaveBeenCalledWith({
        categoryId: "transport",
        suggested: { categoryId: "transport", tagIds: ["work"] },
        tagIds: [],
        transactionId: TRANSACTION,
      })
    );
  });

  it("dismissing a suggestion saves nothing", async () => {
    rpc.suggest.mockResolvedValue({
      status: "suggested",
      suggested: { categoryId: "transport", tagIds: [] },
    });
    const user = userEvent.setup();
    renderSuggestion();

    await user.click(
      await screen.findByRole("button", { name: "Suggest a category" })
    );
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(
      screen.getByRole("button", { name: "Suggest a category" })
    ).toBeVisible();
    expect(rpc.accept).not.toHaveBeenCalled();
  });

  it("points to the rule when one already covers the transaction", async () => {
    rpc.suggest.mockResolvedValue({
      message: "Your rule “Grab” covers this transaction.",
      status: "rule",
    });
    const user = userEvent.setup();
    renderSuggestion();

    await user.click(
      await screen.findByRole("button", { name: "Suggest a category" })
    );
    expect(
      await screen.findByText("Your rule “Grab” covers this transaction.")
    ).toBeVisible();
  });

  it("shows where an accepted, edited suggestion came from", async () => {
    renderSuggestion({
      categoryId: "transport",
      suggestionApplication: {
        acceptedAt: "2026-09-28T00:00:00.000Z",
        acceptedByUserId: "user-1",
        categoryId: "transport",
        suggested: { categoryId: "transport", tagIds: ["work"] },
        tagIds: [],
      },
    });

    expect(
      await screen.findByText("From a suggestion you edited, then accepted")
    ).toBeVisible();
  });

  it.each([
    ["the flag is off", {}, false, true],
    ["the user can't edit", {}, true, false],
    ["it has no note", { notes: null }, true, true],
    ["it is split", { splits: [{ id: "split-1" }] }, true, true],
  ])("offers nothing when %s", async (_name, overrides, flag, canAccept) => {
    enabled.mockReturnValue(flag);
    renderSuggestion(overrides, canAccept);

    expect(await screen.findByText("rendered")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Suggestions" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Suggest a category" })
    ).toBeNull();
  });
});
