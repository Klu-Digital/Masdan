import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

import type { Reminder } from "../types";

const toast = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@masdan/ui/components/toast", () => ({ toastManager: toast }));

const rpc = vi.hoisted(() => ({
  dismiss: vi.fn(),
  list: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      reminders: {
        dismiss: rpc.dismiss,
        list: rpc.list,
        restore: rpc.restore,
      },
    }),
  };
});

const { RemindersMenu } = await import("./reminders-menu");

const ORG = "00000000-0000-4000-8000-0000000000aa";
const TODAY = "2026-03-05";

const reminder = (values: Partial<Reminder> = {}): Reminder => ({
  account: {
    cardLastFour: "4242",
    cardNetwork: "Visa",
    cardProductKey: null,
    color: null,
    currencyCode: "PHP",
    icon: null,
    id: "00000000-0000-4000-8000-000000000001",
    institution: "BPI",
    name: "BPI Visa",
  },
  balance: "12000.000000",
  daysLeft: 5,
  eventDate: "2026-03-10",
  id: "00000000-0000-4000-8000-000000000011",
  kind: "payment",
  minimumAmountDue: "500.000000",
  minimumPaid: false,
  paidAmount: "0",
  source: "statement",
  statementBalance: "12000.000000",
  ...values,
});

const overdue = reminder({
  account: {
    cardLastFour: null,
    cardNetwork: null,
    cardProductKey: null,
    color: null,
    currencyCode: "PHP",
    icon: null,
    id: "00000000-0000-4000-8000-000000000002",
    institution: null,
    name: "Metrobank Mastercard",
  },
  daysLeft: -2,
  eventDate: "2026-03-03",
  id: "00000000-0000-4000-8000-000000000012",
});

const closing = reminder({
  daysLeft: 2,
  eventDate: "2026-03-07",
  id: "00000000-0000-4000-8000-000000000013",
  kind: "statement",
  paidAmount: null,
});

const renderMenu = (canDismiss = true) =>
  renderWithProviders(
    <RemindersMenu activeOrganizationId={ORG} canDismiss={canDismiss} />
  );

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /reminders/iu }));
  return {
    list: await screen.findByRole("list", { name: "Card reminders" }),
    user,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RemindersMenu", () => {
  it("counts active reminders on the trigger", async () => {
    rpc.list.mockResolvedValue({ items: [reminder(), overdue], today: TODAY });
    renderMenu();

    expect(
      await screen.findByRole("button", { name: "Reminders, 2 active" })
    ).toBeInTheDocument();
  });

  it("lists each reminder's state and links to its card", async () => {
    rpc.list.mockResolvedValue({
      items: [
        overdue,
        closing,
        reminder({ minimumPaid: true, paidAmount: "600" }),
      ],
      today: TODAY,
    });
    renderMenu();
    const { list } = await openMenu();
    const [overdueRow, closingRow, partlyPaidRow] =
      within(list).getAllByRole("listitem");

    expect(overdueRow).toHaveTextContent("Payment overdue");
    expect(overdueRow).toHaveTextContent("Overdue");
    expect(overdueRow).toHaveTextContent("Metrobank Mastercard");
    expect(within(overdueRow as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      `/accounts/${overdue.account.id}`
    );
    expect(closingRow).toHaveTextContent("Statement closing");
    expect(closingRow).toHaveTextContent("BPI Visa •••• 4242");
    expect(partlyPaidRow).toHaveTextContent("Minimum paid");
    expect(partlyPaidRow).toHaveTextContent("left of");
  });

  it("says when there is nothing to do", async () => {
    rpc.list.mockResolvedValue({ items: [], today: TODAY });
    renderMenu();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reminders" }));

    expect(await screen.findByText(/all caught up/iu)).toBeInTheDocument();
  });

  it("dismisses a reminder and offers to undo it", async () => {
    rpc.list.mockResolvedValue({ items: [reminder()], today: TODAY });
    rpc.dismiss.mockResolvedValue({ id: reminder().id, status: "dismissed" });
    rpc.restore.mockResolvedValue({ id: reminder().id, status: "active" });
    renderMenu();
    const { list, user } = await openMenu();

    rpc.list.mockResolvedValue({ items: [], today: TODAY });
    await user.click(
      within(list).getByRole("button", {
        name: "Dismiss “Payment due” for BPI Visa",
      })
    );

    await waitFor(() => {
      expect(rpc.dismiss).toHaveBeenCalledWith({ reminderId: reminder().id });
    });
    expect(await screen.findByText(/all caught up/iu)).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.add).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Reminder for BPI Visa dismissed",
          type: "success",
        })
      );
    });

    const [[added]] = toast.add.mock.calls as [
      [{ actionProps: { onClick: () => void } }],
    ];
    added.actionProps.onClick();
    await waitFor(() => {
      expect(rpc.restore).toHaveBeenCalledWith({ reminderId: reminder().id });
    });
  });

  it("hides dismissal from someone who can only read", async () => {
    rpc.list.mockResolvedValue({ items: [reminder()], today: TODAY });
    renderMenu(false);
    const { list } = await openMenu();

    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
  });
});
