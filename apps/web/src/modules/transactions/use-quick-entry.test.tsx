import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface ToastOptions {
  actionProps?: { children: string; onClick: () => void };
  title: string;
}
const toast = vi.hoisted(() =>
  vi.fn((_options: ToastOptions): string => "toast-1")
);
const closeToast = vi.hoisted(() => vi.fn());
vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: toast, close: closeToast, update: vi.fn() },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const parseQuickEntry = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const createTransfer = vi.hoisted(() => vi.fn());
const deleteTransfer = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      transactions: { archive, create, parseQuickEntry },
      transfers: { create: createTransfer, delete: deleteTransfer },
    }),
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { useQuickEntry } = await import("./use-quick-entry");

const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const DINING = "00000000-0000-4000-8000-000000000005";
const TEXT = "mj date - dinner at jollibee - 400 - metrobank mc";

const input = {
  accountId: ACCOUNT,
  amount: "400",
  categoryId: DINING,
  notes: "mj date - dinner at jollibee",
  paidStatus: "paid",
  tagIds: [],
  transactionDate: "2026-09-26",
};

const complete = {
  ai: "ok",
  input,
  issues: [],
  kind: "expense",
  prefill: { ...input, tagIds: undefined },
};

const needsReview = {
  ai: "ok",
  input: null,
  issues: [
    {
      field: "accountId",
      message: "Could be Metrobank Titanium or Metrobank Payroll — choose one",
      reason: "ambiguous",
    },
    {
      field: "kind",
      message: "It reads as both money in and money out — check the type",
      reason: "conflict",
    },
  ],
  kind: "expense",
  prefill: {
    accountId: null,
    amount: "400",
    categoryId: DINING,
    notes: "dinner at jollibee",
    paidStatus: "paid",
    transactionDate: "2026-09-26",
  },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const compose = vi.fn();
const setup = (canArchive = true) =>
  renderHook(
    () =>
      useQuickEntry({
        activeOrganizationId: "household-1",
        canArchive,
        compose,
      }),
    { wrapper: Wrapper }
  ).result.current;

const toasts = () => toast.mock.calls.map(([options]) => options);
const toastTitled = (title: string) => {
  const found = toasts().find((options) => options.title === title);
  if (!found?.actionProps) {
    throw new Error(`No "${title}" toast with an action`);
  }
  return found.actionProps;
};

beforeEach(() => {
  for (const mock of [toast, closeToast, compose, navigate, create]) {
    mock.mockClear();
  }
  createTransfer.mockReset().mockResolvedValue({
    destinationAccount: { currencyCode: "PHP", name: "MariBank" },
    id: "transfer-1",
    sourceAccount: { currencyCode: "PHP", name: "GCash" },
    sourceAmount: "4500",
  });
  deleteTransfer.mockReset().mockResolvedValue({ id: "transfer-1" });
  parseQuickEntry.mockReset();
  archive.mockReset().mockResolvedValue({ id: "transaction-1" });
  create.mockReset().mockResolvedValue({
    accountName: "Metrobank Titanium",
    amount: "400.000000",
    categoryName: "Food & Dining",
    currencyCode: "PHP",
    id: "transaction-1",
    type: "expense",
  });
});

describe("useQuickEntry", () => {
  const transferInput = {
    destinationAccountId: "00000000-0000-4000-8000-000000000002",
    destinationAmount: "4500",
    notes: "transfer 4.5k from gcash to maribank",
    sourceAccountId: ACCOUNT,
    sourceAmount: "4500",
    transactionDate: "2026-09-26",
  };
  const transferParse = {
    ai: "ok",
    input: transferInput,
    issues: [],
    kind: "transfer",
    prefill: transferInput,
  };

  it("creates a transfer instead of an expense, and undo removes the transfer", async () => {
    parseQuickEntry.mockResolvedValue(transferParse);
    await setup().add(transferInput.notes);
    expect(createTransfer).toHaveBeenCalledWith(transferInput);
    expect(create).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    toastTitled("Transfer recorded").onClick();
    await waitFor(() =>
      expect(deleteTransfer).toHaveBeenCalledWith({ transferId: "transfer-1" })
    );
  });

  it("reviews linked transfers in the transfer form without creating", async () => {
    parseQuickEntry.mockResolvedValue(transferParse);
    await setup().review(transferInput.notes);
    expect(createTransfer).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledWith({
      prefill: {
        issues: [],
        source: transferInput.notes,
        values: transferInput,
      },
      type: "transfer",
    });
  });

  it("preserves transfer values when creation fails", async () => {
    parseQuickEntry.mockResolvedValue(transferParse);
    createTransfer.mockRejectedValue(new Error("Account archived"));
    await setup().add(transferInput.notes);
    expect(compose).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transfer" })
    );
    expect(create).not.toHaveBeenCalled();
  });
  it("creates a complete line at once and offers Undo, with no form", async () => {
    parseQuickEntry.mockResolvedValue(complete);

    await setup().add(TEXT);

    expect(parseQuickEntry).toHaveBeenCalledWith({ text: TEXT });
    expect(create).toHaveBeenCalledWith(input);
    expect(compose).not.toHaveBeenCalled();
    expect(closeToast).toHaveBeenCalledWith("toast-1");
    expect(toasts()).toContainEqual(
      expect.objectContaining({
        actionProps: expect.objectContaining({ children: "Undo" }),
        title: "Expense added",
      })
    );
  });

  it("undoes a created entry by archiving it", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    await setup().add(TEXT);
    toastTitled("Expense added").onClick();

    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({ transactionId: "transaction-1" })
    );
    await waitFor(() =>
      expect(toasts()).toContainEqual(
        expect.objectContaining({ title: "Transaction removed" })
      )
    );
  });

  it("offers View instead of Undo to roles that cannot archive", async () => {
    parseQuickEntry.mockResolvedValue(complete);

    await setup(false).add(TEXT);

    expect(toasts()).toContainEqual(
      expect.objectContaining({
        actionProps: expect.objectContaining({ children: "View" }),
        title: "Expense added",
      })
    );
  });

  it("opens the prefilled form for anything unresolved", async () => {
    parseQuickEntry.mockResolvedValue(needsReview);

    await setup().add(TEXT);

    expect(create).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledWith({
      kind: "expense",
      prefill: {
        issues: [
          {
            field: "accountId",
            message:
              "Could be Metrobank Titanium or Metrobank Payroll — choose one",
          },
          {
            field: "categoryId",
            message: "It reads as both money in and money out — check the type",
          },
        ],
        source: TEXT,
        values: {
          accountId: undefined,
          amount: "400",
          categoryId: DINING,
          notes: "dinner at jollibee",
          paidStatus: "paid",
          transactionDate: "2026-09-26",
        },
      },
      type: "transaction",
    });
  });

  it("falls back to the form when create itself refuses the payload", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    create.mockRejectedValue(new Error("Choose an active category"));

    await setup().add(TEXT);

    expect(compose).toHaveBeenCalledTimes(1);
    expect(toasts()).toContainEqual(
      expect.objectContaining({ title: "Choose an active category" })
    );
  });

  it("creates nothing when parsing fails, and offers the text in a blank form", async () => {
    parseQuickEntry.mockRejectedValue(new Error("Network error"));

    await setup().add(TEXT);

    expect(create).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    toastTitled("Couldn’t read that entry").onClick();
    expect(compose).toHaveBeenCalledWith(
      expect.objectContaining({
        prefill: { issues: [], source: TEXT, values: { notes: TEXT } },
      })
    );
  });

  it("never creates when reviewing text from a link", async () => {
    parseQuickEntry.mockResolvedValue(complete);

    await setup().review(TEXT);

    expect(create).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledTimes(1);
  });

  it("ignores blank text without a round trip", async () => {
    await setup().add("   ");

    expect(parseQuickEntry).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
