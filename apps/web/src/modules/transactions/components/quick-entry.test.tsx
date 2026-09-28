import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: toast, close: vi.fn(), update: vi.fn() },
}));

const compose = vi.hoisted(() => vi.fn());
vi.mock("@/components/app-actions", () => ({
  useAppActions: () => ({ compose }),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const parseQuickEntry = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: { transactions: { archive, create, parseQuickEntry } },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { QuickEntry } = await import("./quick-entry");

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

const renderQuickEntry = (canArchive = true) =>
  render(
    <QuickEntry activeOrganizationId="household-1" canArchive={canArchive} />,
    { wrapper: Wrapper }
  );

const submitText = async (
  user: ReturnType<typeof userEvent.setup>,
  text = TEXT
) => {
  await user.type(screen.getByRole("textbox", { name: "Quick entry" }), text);
  await user.click(screen.getByRole("button", { name: "Add" }));
};

beforeEach(() => {
  for (const mock of [toast, compose, navigate, parseQuickEntry, create]) {
    mock.mockReset();
  }
  archive.mockReset().mockResolvedValue({ id: "transaction-1" });
  create.mockResolvedValue({
    accountName: "Metrobank Titanium",
    amount: "400.000000",
    categoryName: "Food & Dining",
    currencyCode: "PHP",
    id: "transaction-1",
    type: "expense",
  });
});

describe("QuickEntry", () => {
  it("creates a complete entry at once, with Undo and View and no form", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const user = userEvent.setup();
    renderQuickEntry();

    await submitText(user);

    const status = await screen.findByRole("alert");
    expect(status).toHaveTextContent("Expense added");
    expect(status).toHaveTextContent("Food & Dining");
    expect(status).toHaveTextContent("Metrobank Titanium");
    expect(parseQuickEntry).toHaveBeenCalledWith({ text: TEXT });
    expect(create).toHaveBeenCalledWith(input);
    expect(compose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
      ""
    );

    await user.click(screen.getByRole("button", { name: "View" }));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { transactionId: "transaction-1" },
        to: "/transactions/$transactionId",
      })
    );
  });

  it("undoes a created entry and gives the text back", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const user = userEvent.setup();
    renderQuickEntry();
    await submitText(user);

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({ transactionId: "transaction-1" })
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
        TEXT
      )
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers Undo only to roles that can archive", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const user = userEvent.setup();
    renderQuickEntry(false);
    await submitText(user);

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Undo" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("opens the prefilled form for anything unresolved, keeping the text", async () => {
    parseQuickEntry.mockResolvedValue(needsReview);
    const user = userEvent.setup();
    renderQuickEntry();

    await submitText(user);

    await waitFor(() => expect(compose).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    expect(compose).toHaveBeenCalledWith(
      expect.objectContaining({
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
              message:
                "It reads as both money in and money out — check the type",
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
      })
    );
    expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
      TEXT
    );

    // Saving from the form is what finally clears the line.
    const [[request]] = compose.mock.calls as [[{ onSaved: () => void }]];
    request.onSaved();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
        ""
      )
    );
  });

  it("falls back to the form when create itself refuses the payload", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    create.mockRejectedValue(new Error("Choose an active category"));
    const user = userEvent.setup();
    renderQuickEntry();

    await submitText(user);

    await waitFor(() => expect(compose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Choose an active category" })
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the text and creates nothing when parsing fails", async () => {
    parseQuickEntry.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    renderQuickEntry();

    await submitText(user);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn’t read that entry" })
      )
    );
    expect(create).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
      TEXT
    );
  });

  it("never parses or creates while the user is still typing", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const user = userEvent.setup();
    renderQuickEntry();

    await user.type(
      screen.getByRole("textbox", { name: "Quick entry" }),
      "dinner 400 gcash"
    );
    await user.click(document.body);

    expect(parseQuickEntry).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("reads text from a link into the form without ever creating", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const onLinkedTextRead = vi.fn();
    render(
      <QuickEntry
        activeOrganizationId="household-1"
        canArchive
        linkedText={TEXT}
        onLinkedTextRead={onLinkedTextRead}
      />,
      { wrapper: Wrapper }
    );

    // Complete as it is, it still opens for review: a link is not a create intent.
    await waitFor(() => expect(compose).toHaveBeenCalledTimes(1));
    expect(parseQuickEntry).toHaveBeenCalledWith({ text: TEXT });
    expect(create).not.toHaveBeenCalled();
    expect(onLinkedTextRead).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Quick entry" })).toHaveValue(
      TEXT
    );
  });

  it("submits on Enter", async () => {
    parseQuickEntry.mockResolvedValue(complete);
    const user = userEvent.setup();
    renderQuickEntry();

    await user.type(
      screen.getByRole("textbox", { name: "Quick entry" }),
      `${TEXT}{Enter}`
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
