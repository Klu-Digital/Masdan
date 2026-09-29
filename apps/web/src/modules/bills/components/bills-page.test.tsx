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
  paidBy: null,
  payment: null,
  postedTransactionId: POSTING,
  scheduleStatus: "active",
  source: "schedule",
  sourceId: RENT,
  status: "overdue",
};

const visa = {
  account: { ...account, id: VISA, name: "BPI Visa" },
  amount: "12000.000000",
  category: null,
  currencyCode: "PHP",
  dueDate: "2026-09-30",
  key: `card:${VISA}:2026-09-30`,
  kind: "card",
  minimumAmountDue: "500.000000",
  name: "BPI Visa",
  paidAmount: "12000.000000",
  paidBy: "transfers",
  payment: null,
  postedTransactionId: null,
  scheduleStatus: null,
  source: "statement",
  sourceId: VISA,
  status: "paid",
};

const internet = {
  ...rent,
  amount: "1699.000000",
  dueDate: "2026-09-28",
  key: `recurring:${RENT}:2026-09-28`,
  name: "Internet",
  postedTransactionId: null,
  status: "expected",
};

const monthOf = (month: string, bills: unknown[]) => ({
  bills,
  currentMonth: "2026-09",
  dateFrom: `${month}-01`,
  dateTo: `${month}-30`,
  month,
  timezone: "Asia/Manila",
  today: "2026-09-20",
  totals:
    bills.length === 0
      ? []
      : [
          {
            currencyCode: "PHP",
            due: "31699.000000",
            expected: "1699.000000",
            overdue: "18000.000000",
            paid: "12000.000000",
            unknownAmountCount: 0,
          },
        ],
});

const Harness = ({ canConfirm }: { canConfirm: boolean }) => {
  const [month, setMonth] = useState<string>();
  return (
    <BillsPage
      activeOrganizationId="household-1"
      canConfirm={canConfirm}
      month={month}
      onMonthChange={(next) => setMonth(next)}
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
      monthOf(month, month === "2026-09" ? [rent, internet, visa] : [])
    );
  });
  rpc.candidates.mockResolvedValue([
    {
      accountName: "BPI Savings",
      amount: "18000.000000",
      categoryName: "Housing",
      currencyCode: "PHP",
      id: POSTING,
      isPosting: true,
      notes: null,
      transactionDate: "2026-09-15",
    },
  ]);
  rpc.confirm.mockResolvedValue({ id: PAYMENT });
  rpc.feedStatus.mockResolvedValue({ feed: null });
  rpc.feedCreate.mockResolvedValue({
    path: `/feeds/bills/${"a".repeat(43)}.ics`,
  });
});

describe("BillsPage", () => {
  it("groups the month's bills by state with per-currency totals", async () => {
    renderPage();

    const overdue = await screen.findByRole("list", { name: "Overdue bills" });
    expect(overdue).toHaveTextContent("Rent");
    expect(overdue).toHaveTextContent("₱18,000.00");
    expect(
      screen.getByRole("list", { name: "Upcoming bills" })
    ).toHaveTextContent("Internet");
    expect(screen.getByRole("list", { name: "Paid bills" })).toHaveTextContent(
      "BPI Visa"
    );
    const totals = screen.getByLabelText("PHP totals");
    expect(totals).toHaveTextContent("₱31,699.00");
    expect(totals).toHaveTextContent("₱12,000.00");
    expect(rpc.month).toHaveBeenCalledWith({});
  });

  it("moves between months and shows an empty month plainly", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("list", { name: "Overdue bills" });

    await user.click(screen.getByRole("button", { name: "Next month" }));

    expect(await screen.findByText("No bills in October 2026")).toBeVisible();
    expect(rpc.month).toHaveBeenLastCalledWith({ month: "2026-10" });
    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(
      await screen.findByRole("list", { name: "Overdue bills" })
    ).toBeVisible();
  });

  it("walks the calendar with the keyboard and filters to the chosen day", async () => {
    const user = userEvent.setup();
    renderPage();
    const calendar = await screen.findByRole("table", {
      name: "September 2026 bills",
    });

    // One tab stop: today's cell.
    const today = within(calendar).getByRole("button", {
      name: /^September 20, 2026/u,
    });
    expect(today).toHaveAttribute("tabindex", "0");
    today.focus();
    await user.keyboard(
      "{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}"
    );
    const rentDay = within(calendar).getByRole("button", {
      name: "September 15, 2026, 1 bill, all overdue",
    });
    expect(rentDay).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(rentDay).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Due September 15, 2026")).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Paid bills" })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show the whole month" })
    );
    expect(screen.getByRole("list", { name: "Paid bills" })).toBeVisible();
  });

  it("links the schedule's posting as the payment", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      within(
        await screen.findByRole("list", { name: "Overdue bills" })
      ).getByRole("button", { name: /Rent/u })
    );
    expect(await screen.findByText("Posted by this schedule")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /^Link payment from/u })
    );

    await waitFor(() =>
      expect(rpc.confirm).toHaveBeenCalledWith({
        dueDate: "2026-09-15",
        kind: "recurring",
        sourceId: RENT,
        transactionId: POSTING,
      })
    );
    expect(rpc.candidates).toHaveBeenCalledWith({
      dueDate: "2026-09-15",
      kind: "recurring",
      sourceId: RENT,
    });
  });

  it("confirms a bill with no payment attached", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      within(
        await screen.findByRole("list", { name: "Upcoming bills" })
      ).getByRole("button", { name: /Internet/u })
    );
    await user.click(
      await screen.findByRole("button", { name: "Mark paid without a payment" })
    );

    await waitFor(() =>
      expect(rpc.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: null })
      )
    );
  });

  it("offers a viewer the details but nothing to change", async () => {
    const user = userEvent.setup();
    renderPage(false);

    await user.click(
      within(
        await screen.findByRole("list", { name: "Overdue bills" })
      ).getByRole("button", { name: /Rent/u })
    );

    expect(await screen.findByText("Recurring · BPI Savings")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Mark paid without a payment" })
    ).not.toBeInTheDocument();
    expect(rpc.candidates).not.toHaveBeenCalled();
  });

  it("shows a new calendar link once, on the page's own origin", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Get calendar link" })
    );

    expect(await screen.findByLabelText("Calendar link")).toHaveValue(
      `${window.location.origin}/feeds/bills/${"a".repeat(43)}.ics`
    );
    expect(screen.getByRole("button", { name: "Turn off" })).toBeVisible();
  });
});
