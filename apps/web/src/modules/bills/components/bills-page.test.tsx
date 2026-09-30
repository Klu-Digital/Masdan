import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const rpc = vi.hoisted(() => ({
  candidates: vi.fn(),
  confirm: vi.fn(),
  feedCreate: vi.fn(),
  feedRevoke: vi.fn(),
  feedStatus: vi.fn(),
  month: vi.fn(),
  unconfirm: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      bills: {
        candidates: rpc.candidates,
        confirm: rpc.confirm,
        feed: {
          create: rpc.feedCreate,
          revoke: rpc.feedRevoke,
          status: rpc.feedStatus,
        },
        month: rpc.month,
        unconfirm: rpc.unconfirm,
      },
    }),
  };
});

const { BillsPage } = await import("./bills-page");

const RENT = "00000000-0000-4000-8000-000000000001";
const VISA = "00000000-0000-4000-8000-000000000002";
const POSTING = "00000000-0000-4000-8000-000000000003";
const PAYMENT = "00000000-0000-4000-8000-000000000004";
const account = { color: "blue", icon: null, id: "bank", name: "BPI Savings" };

const rent = {
  account,
  amount: "18000.000000",
  category: { color: "orange", icon: "🏠", name: "Housing" },
  currencyCode: "PHP",
  dueDate: "2026-09-15",
  key: `recurring:${RENT}:2026-09-15`,
  kind: "recurring",
  minimumAmountDue: null,
  name: "Rent",
  paidAmount: null,
  paidBy: "posting",
  payment: null,
  postedTransactionId: POSTING,
  scheduleStatus: "active",
  source: "schedule",
  sourceId: RENT,
  status: "paid",
  transactionType: "expense",
};
const payday = {
  ...rent,
  amount: "50000.000000",
  dueDate: "2026-09-28",
  key: `recurring:${RENT}:2026-09-28`,
  name: "Payday",
  paidBy: null,
  postedTransactionId: null,
  status: "expected",
  transactionType: "income",
};
const visa = {
  ...rent,
  account: { ...account, id: VISA, name: "BPI Visa" },
  amount: "12000.000000",
  category: null,
  dueDate: "2026-09-16",
  key: `card:${VISA}:2026-09-16`,
  kind: "card",
  minimumAmountDue: "500.000000",
  name: "BPI Visa",
  paidAmount: "0.000000",
  paidBy: null,
  postedTransactionId: null,
  scheduleStatus: null,
  source: "statement",
  sourceId: VISA,
  status: "overdue",
  transactionType: null,
};

const monthOf = (month: string, bills: unknown[]) => ({
  bills,
  currentMonth: "2026-09",
  dateFrom: `${month}-01`,
  dateTo: `${month}-30`,
  month,
  timezone: "Asia/Manila",
  today: "2026-09-20",
  totals: [],
});
const Harness = ({ canConfirm }: { canConfirm: boolean }) => {
  const [month, setMonth] = useState<string>();
  return (
    <BillsPage
      activeOrganizationId="household-1"
      canConfirm={canConfirm}
      month={month}
      onMonthChange={setMonth}
    />
  );
};
const renderPage = (canConfirm = true) =>
  renderWithProviders(
    <Harness canConfirm={canConfirm} />,
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.month.mockImplementation((input?: { month?: string }) => {
    const month = input?.month ?? "2026-09";
    return Promise.resolve(
      monthOf(month, month === "2026-09" ? [rent, visa, payday] : [])
    );
  });
  rpc.candidates.mockResolvedValue([]);
  rpc.confirm.mockResolvedValue({ id: PAYMENT });
  rpc.feedStatus.mockResolvedValue({ feed: null });
  rpc.feedCreate.mockResolvedValue({
    path: `/feeds/bills/${"a".repeat(43)}.ics`,
  });
});

describe("Calendar", () => {
  it("shows recurring income, expenses and card bills inside the calendar", async () => {
    renderPage();
    const calendar = await screen.findByRole("table", {
      name: "September 2026 calendar",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "Calendar" })
    ).toBeVisible();
    expect(calendar).toHaveTextContent("Income · Payday");
    expect(calendar).toHaveTextContent("Expense · Rent");
    expect(calendar).toHaveTextContent("Card bill · BPI Visa");
    expect(
      within(calendar).getByText("Income · Payday").previousElementSibling
    ).toHaveClass("bg-positive", "shrink-0");
    expect(
      within(calendar).getByText("Expense · Rent").previousElementSibling
    ).toHaveClass("bg-destructive", "shrink-0");
    expect(
      within(calendar).getByText("Card bill · BPI Visa").previousElementSibling
    ).toHaveClass("bg-info", "shrink-0");
    expect(
      screen.getByRole("list", { name: "Completed events" })
    ).toHaveTextContent("Posted");
    expect(
      screen.getByRole("list", { name: "Overdue events" })
    ).toHaveTextContent("BPI Visa");
    expect(rpc.month).toHaveBeenCalledWith({});
  });

  it("keeps the calendar visible in an empty month and returns to this month", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("table", { name: "September 2026 calendar" });
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("No events in October 2026")).toBeVisible();
    expect(
      screen.getByRole("table", { name: "October 2026 calendar" })
    ).toBeVisible();
    expect(rpc.month).toHaveBeenLastCalledWith({ month: "2026-10" });
    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(
      await screen.findByRole("list", { name: "Completed events" })
    ).toBeVisible();
  });

  it("supports keyboard day selection and filters the agenda", async () => {
    const user = userEvent.setup();
    renderPage();
    const calendar = await screen.findByRole("table", {
      name: "September 2026 calendar",
    });
    const today = within(calendar).getByRole("button", {
      name: /^September 20, 2026/u,
    });
    expect(today).toHaveAttribute("tabindex", "0");
    today.focus();
    await user.keyboard(
      "{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}"
    );
    const rentDay = within(calendar).getByRole("button", {
      name: "September 15, 2026, 1 bill, all paid",
    });
    expect(rentDay).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(rentDay).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("list", { name: "Overdue events" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show the whole month" })
    );
    expect(screen.getByRole("list", { name: "Overdue events" })).toBeVisible();
  });

  it("shows automatic recurring posting without any confirmation actions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(
        await screen.findByRole("list", { name: "Completed events" })
      ).getByRole("button", { name: /Rent/u })
    );
    expect(
      await screen.findByText("Posted automatically by this schedule")
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View transaction" })
    ).toHaveAttribute("href", `/transactions/${POSTING}`);
    expect(
      screen.queryByRole("button", { name: "Mark paid without a payment" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark unpaid" })
    ).not.toBeInTheDocument();
    expect(rpc.candidates).not.toHaveBeenCalled();
    expect(rpc.confirm).not.toHaveBeenCalled();
  });

  it("does not ask to confirm future recurring income either", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(
        await screen.findByRole("list", { name: "Upcoming events" })
      ).getByRole("button", { name: /Payday/u })
    );
    expect(
      await screen.findByText("Recurring income · BPI Savings")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Mark paid without a payment" })
    ).not.toBeInTheDocument();
    expect(rpc.candidates).not.toHaveBeenCalled();
  });

  it("still allows card bills to be confirmed", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(
        await screen.findByRole("list", { name: "Overdue events" })
      ).getByRole("button", { name: /BPI Visa/u })
    );
    await user.click(
      await screen.findByRole("button", { name: "Mark paid without a payment" })
    );
    await waitFor(() =>
      expect(rpc.confirm).toHaveBeenCalledWith({
        dueDate: "2026-09-16",
        kind: "card",
        sourceId: VISA,
        transactionId: null,
      })
    );
  });

  it("offers viewers details without card payment controls", async () => {
    const user = userEvent.setup();
    renderPage(false);
    await user.click(
      within(
        await screen.findByRole("list", { name: "Overdue events" })
      ).getByRole("button", { name: /BPI Visa/u })
    );
    expect(
      await screen.findByText("Statement due date · BPI Visa")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Mark paid without a payment" })
    ).not.toBeInTheDocument();
    expect(rpc.candidates).not.toHaveBeenCalled();
  });

  it("shows a recoverable calendar loading error", async () => {
    rpc.month.mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByText("Couldn’t load calendar")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("shows the subscription link on the page's origin", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Get calendar link" })
    );
    expect(await screen.findByLabelText("Calendar link")).toHaveValue(
      `${window.location.origin}/feeds/bills/${"a".repeat(43)}.ics`
    );
  });
});
