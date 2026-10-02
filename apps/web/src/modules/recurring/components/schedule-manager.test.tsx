import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { householdToday } from "@/lib/household-date";
import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const rpc = vi.hoisted(() => ({
  accounts: vi.fn(),
  categories: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  pause: vi.fn(),
  postings: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  tags: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: rpc.accounts },
      categories: { list: rpc.categories },
      recurringSchedules: {
        create: rpc.create,
        list: rpc.list,
        pause: rpc.pause,
        postings: rpc.postings,
        resume: rpc.resume,
        stop: rpc.stop,
        update: rpc.update,
      },
      tags: { list: rpc.tags },
    }),
  };
});

const { ScheduleManager } = await import("./schedule-manager");

const TIMEZONE = "Asia/Manila";
const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const HOUSING = "00000000-0000-4000-8000-000000000002";
const SALARY = "00000000-0000-4000-8000-000000000003";
const BILLS = "00000000-0000-4000-8000-000000000004";
const RENT = "00000000-0000-4000-8000-000000000005";
const PAYDAY = "00000000-0000-4000-8000-000000000006";
const GYM = "00000000-0000-4000-8000-000000000007";
const POSTED = "00000000-0000-4000-8000-000000000008";

const baseSchedule = {
  accountId: ACCOUNT,
  accountName: "BPI Savings",
  createdAt: new Date("2026-01-01"),
  currencyCode: "PHP",
  endDate: null,
  interval: 1,
  lastError: null,
  lastOccurrenceDate: null,
  notes: null,
  paidStatus: "paid",
  pausedAt: null,
  postedCount: 0,
  stoppedAt: null,
  tags: [],
  updatedAt: new Date("2026-01-01"),
};

const rent = {
  ...baseSchedule,
  amount: "18000.000000",
  categoryColor: "orange",
  categoryIcon: "🏠",
  categoryId: HOUSING,
  categoryName: "Housing",
  frequency: "monthly",
  id: RENT,
  lastOccurrenceDate: "2026-09-05",
  name: "Rent",
  nextOccurrenceDate: "2026-10-05",
  notes: "Condo rent",
  postedCount: 3,
  startDate: "2026-07-05",
  status: "active",
  tags: [{ archivedAt: null, color: "amber", id: BILLS, name: "Bills" }],
  type: "expense",
};

const payday = {
  ...baseSchedule,
  amount: "45000.000000",
  categoryColor: "green",
  categoryIcon: "💼",
  categoryId: SALARY,
  categoryName: "Salary",
  frequency: "weekly",
  id: PAYDAY,
  interval: 2,
  lastError: "Choose an active category",
  name: "Payday",
  nextOccurrenceDate: "2026-09-18",
  pausedAt: new Date("2026-09-18"),
  startDate: "2026-09-04",
  status: "paused",
  type: "income",
};

const gym = {
  ...baseSchedule,
  amount: "2500.000000",
  categoryColor: "orange",
  categoryIcon: "🏠",
  categoryId: HOUSING,
  categoryName: "Housing",
  frequency: "monthly",
  id: GYM,
  name: "Gym",
  nextOccurrenceDate: null,
  startDate: "2026-01-10",
  status: "stopped",
  stoppedAt: new Date("2026-06-01"),
  type: "expense",
};

const EVERYTHING = { canCreate: true, canStop: true, canUpdate: true };

const renderManager = (permissions = EVERYTHING) =>
  renderWithProviders(
    <ScheduleManager
      activeOrganizationId="household-1"
      householdCurrency="PHP"
      permissions={permissions}
      timezone={TIMEZONE}
    />
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.list.mockResolvedValue([rent, payday, gym]);
  rpc.accounts.mockResolvedValue([
    {
      accountType: "bank",
      archivedAt: null,
      color: null,
      currencyCode: "PHP",
      id: ACCOUNT,
      name: "BPI Savings",
    },
  ]);
  rpc.categories.mockResolvedValue([
    {
      archivedAt: null,
      color: "orange",
      icon: "🏠",
      id: HOUSING,
      name: "Housing",
      type: "expense",
    },
    {
      archivedAt: null,
      color: "green",
      icon: "💼",
      id: SALARY,
      name: "Salary",
      type: "income",
    },
  ]);
  rpc.tags.mockResolvedValue([
    { archivedAt: null, color: "amber", id: BILLS, name: "Bills" },
  ]);
  rpc.create.mockResolvedValue(rent);
  rpc.update.mockResolvedValue(rent);
  rpc.pause.mockResolvedValue({ ...rent, status: "paused" });
  rpc.resume.mockResolvedValue({ ...payday, status: "active" });
  rpc.stop.mockResolvedValue({ ...rent, status: "stopped" });
  rpc.postings.mockResolvedValue([
    {
      amount: "18000.000000",
      archivedAt: null,
      currencyCode: "PHP",
      id: POSTED,
      occurrenceDate: "2026-09-05",
      transactionDate: "2026-09-05",
    },
  ]);
});

describe("ScheduleManager", () => {
  it("lists each schedule with its rhythm, state and what it has posted", async () => {
    renderManager();
    const list = await screen.findByRole("list", {
      name: "Recurring schedules",
    });
    const [first, second, third] = within(list).getAllByRole("listitem");

    expect(first).toHaveTextContent("Rent");
    expect(first).toHaveTextContent("Monthly on the 5th · next");
    expect(first).toHaveTextContent("3 posted");
    expect(second).toHaveTextContent("Payday");
    expect(second).toHaveTextContent("Every 2 weeks on Friday · paused");
    expect(within(second as HTMLElement).getByText("Paused")).toBeVisible();
    expect(
      within(second as HTMLElement).getByText("Needs attention")
    ).toBeVisible();
    expect(third).toHaveTextContent("Gym");
    expect(within(third as HTMLElement).getByText("Stopped")).toBeVisible();
  });

  it("shows an empty state that invites a first schedule", async () => {
    rpc.list.mockResolvedValue([]);
    renderManager();

    expect(await screen.findByText("No recurring transactions")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add a schedule" })
    ).toBeVisible();
  });

  it("creates a monthly expense from transaction fields", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([]);
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "New schedule" })
    );
    await user.type(await screen.findByLabelText("Amount"), "18000");
    await user.type(screen.getByLabelText("Name"), "Rent");
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: /Housing/u }));
    await user.type(screen.getByLabelText("Note"), "Condo rent");
    await user.click(screen.getByRole("button", { name: /Bills/u }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Posts /u);
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() =>
      expect(rpc.create).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        amount: "18000",
        categoryId: HOUSING,
        endDate: null,
        frequency: "monthly",
        interval: 1,
        name: "Rent",
        notes: "Condo rent",
        paidStatus: "paid",
        startDate: householdToday(TIMEZONE),
        tagIds: [BILLS],
      })
    );
  });

  it("creates a custom every-N-weeks income", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([]);
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "New schedule" })
    );
    await user.click(await screen.findByRole("tab", { name: "Income" }));
    await user.type(screen.getByLabelText("Amount"), "45000");
    await user.type(screen.getByLabelText("Name"), "Payday");
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: /Salary/u }));
    await user.click(screen.getByRole("combobox", { name: "Frequency" }));
    await user.click(await screen.findByRole("option", { name: "Weekly" }));
    const every = screen.getByLabelText("Every");
    await user.clear(every);
    await user.type(every, "2");
    expect(screen.getByText("weeks")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    await waitFor(() =>
      expect(rpc.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: SALARY,
          frequency: "weekly",
          interval: 2,
          name: "Payday",
        })
      )
    );
  });

  it("rejects an interval of zero before calling the API", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([]);
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "New schedule" })
    );
    const every = await screen.findByLabelText("Every");
    await user.clear(every);
    await user.type(every, "0");
    await user.click(screen.getByRole("button", { name: "Create schedule" }));

    expect(await screen.findByText("Use 1 to 366")).toBeVisible();
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("edits a schedule, noting that posted transactions stay as they are", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Rent actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(
      await screen.findByText(
        "Changes apply to future transactions only. Ones already posted stay as they are."
      )
    ).toBeVisible();
    const amount = screen.getByLabelText("Amount");
    expect(amount).toHaveValue("18000");
    await user.clear(amount);
    await user.type(amount, "19500");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(rpc.update).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        amount: "19500",
        categoryId: HOUSING,
        endDate: null,
        frequency: "monthly",
        interval: 1,
        name: "Rent",
        notes: "Condo rent",
        paidStatus: "paid",
        scheduleId: RENT,
        startDate: "2026-07-05",
        tagIds: [BILLS],
      })
    );
  });

  it("shows a schedule's end date and lets an edit remove it", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([{ ...rent, endDate: "2027-07-05" }]);
    renderManager();

    const list = await screen.findByRole("list", {
      name: "Recurring schedules",
    });
    expect(list).toHaveTextContent("until July 5, 2027");
    await user.click(screen.getByRole("button", { name: "Rent actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await user.click(
      await screen.findByRole("button", { name: "Remove end date" })
    );
    expect(screen.getByLabelText("Ending")).toHaveTextContent("Never");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(rpc.update).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: null, scheduleId: RENT })
      )
    );
  });

  it("pauses an active schedule and resumes a paused one", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Rent actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Pause" }));
    await waitFor(() =>
      expect(rpc.pause).toHaveBeenCalledWith({ scheduleId: RENT })
    );

    await user.click(screen.getByRole("button", { name: "Payday actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Resume" }));
    await waitFor(() =>
      expect(rpc.resume).toHaveBeenCalledWith({ scheduleId: PAYDAY })
    );
  });

  it("stops a schedule only after confirming", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Rent actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Stop" }));
    expect(await screen.findByText("Stop “Rent”?")).toBeVisible();
    expect(rpc.stop).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop schedule" }));

    await waitFor(() =>
      expect(rpc.stop).toHaveBeenCalledWith({ scheduleId: RENT })
    );
  });

  it("offers no lifecycle actions on a stopped schedule", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Gym actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Details and history" })
    ).toBeVisible();
    for (const name of ["Edit", "Pause", "Resume", "Stop"]) {
      expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
    }
  });

  it("separates the schedule from the transactions it already posted", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: "Rent" }));

    const template = await screen.findByRole("list", { name: "Schedule" });
    expect(template).toHaveTextContent("Monthly on the 5th");
    expect(template).toHaveTextContent("Condo rent");
    const posted = await screen.findByRole("list", {
      name: "Posted transactions",
    });
    expect(within(posted).getByRole("link")).toHaveAttribute(
      "href",
      `/transactions/${POSTED}`
    );
    expect(rpc.postings).toHaveBeenCalledWith({ scheduleId: RENT });
  });

  it("explains why a schedule paused itself", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: "Payday" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Paused automatically: Choose an active category."
    );
  });

  it("hides changes from a viewer", async () => {
    const user = userEvent.setup();
    renderManager({ canCreate: false, canStop: false, canUpdate: false });

    await user.click(
      await screen.findByRole("button", { name: "Rent actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Details and history" })
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Edit" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New schedule" })
    ).not.toBeInTheDocument();
  });

  it("lets a member pause but not stop", async () => {
    const user = userEvent.setup();
    renderManager({ canCreate: true, canStop: false, canUpdate: true });

    await user.click(
      await screen.findByRole("button", { name: "Rent actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Pause" })
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Stop" })
    ).not.toBeInTheDocument();
  });
});
