import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

import type { GoalPermissions } from "./goals-page";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const rpc = vi.hoisted(() => ({
  accounts: vi.fn(),
  archive: vi.fn(),
  complete: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  reopen: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      accounts: { list: rpc.accounts },
      goals: {
        archive: rpc.archive,
        complete: rpc.complete,
        create: rpc.create,
        list: rpc.list,
        reopen: rpc.reopen,
        restore: rpc.restore,
        update: rpc.update,
      },
    }),
  };
});

const { GoalsPage } = await import("./goals-page");

const SAVINGS = "00000000-0000-4000-8000-000000000001";
const CARD = "00000000-0000-4000-8000-000000000002";
const EMERGENCY = "00000000-0000-4000-8000-000000000011";
const LAPTOP = "00000000-0000-4000-8000-000000000012";
const PHONE = "00000000-0000-4000-8000-000000000013";
const BOAT = "00000000-0000-4000-8000-000000000014";

const baseGoal = {
  accountArchivedAt: null,
  accountId: SAVINGS,
  accountName: "BPI Savings",
  archivedAt: null,
  completedAt: null,
  createdAt: new Date("2026-01-01"),
  currencyCode: "PHP",
  measuredOn: null,
  status: "active",
  targetDate: null,
  updatedAt: new Date("2026-01-01"),
};

const emergency = {
  ...baseGoal,
  id: EMERGENCY,
  name: "Emergency fund",
  percent: 99,
  reached: false,
  remaining: "0.500000",
  saved: "99999.500000",
  targetAmount: "100000.000000",
  targetDate: "2026-12-31",
};

const laptop = {
  ...baseGoal,
  id: LAPTOP,
  name: "Laptop",
  percent: 100,
  reached: true,
  remaining: "0.000000",
  saved: "90000.000000",
  targetAmount: "80000.000000",
};

const phone = {
  ...baseGoal,
  completedAt: new Date("2026-06-30T04:00:00Z"),
  id: PHONE,
  measuredOn: "2026-06-30",
  name: "Phone",
  percent: 100,
  reached: true,
  remaining: "0.000000",
  saved: "45000.000000",
  status: "completed",
  targetAmount: "45000.000000",
};

const boat = {
  ...baseGoal,
  accountArchivedAt: new Date("2026-05-01"),
  archivedAt: new Date("2026-05-01T04:00:00Z"),
  id: BOAT,
  measuredOn: "2026-05-01",
  name: "Boat",
  percent: 0,
  reached: false,
  remaining: "600300.000000",
  saved: "-300.000000",
  status: "archived",
  targetAmount: "600000.000000",
};

const EVERYTHING: GoalPermissions = {
  canArchive: true,
  canCreate: true,
  canRestore: true,
  canUpdate: true,
};

const renderPage = (permissions = EVERYTHING) =>
  renderWithProviders(
    <GoalsPage
      activeOrganizationId="household-1"
      householdCurrency="PHP"
      permissions={permissions}
    />,
    new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.list.mockResolvedValue([emergency, laptop, phone, boat]);
  rpc.accounts.mockResolvedValue([
    {
      accountClass: "asset",
      accountType: "bank",
      archivedAt: null,
      color: null,
      currencyCode: "PHP",
      id: SAVINGS,
      name: "BPI Savings",
    },
    {
      accountClass: "liability",
      accountType: "credit_card",
      archivedAt: null,
      color: null,
      currencyCode: "PHP",
      id: CARD,
      name: "Visa",
    },
  ]);
  for (const mutation of [
    rpc.create,
    rpc.update,
    rpc.complete,
    rpc.reopen,
    rpc.archive,
    rpc.restore,
  ]) {
    mutation.mockResolvedValue(emergency);
  }
});

describe("GoalsPage", () => {
  it("shows progress and what is left without rounding up to done", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Active goals" });
    const [first, second] = within(list).getAllByRole("listitem");

    expect(first).toHaveTextContent("Emergency fund");
    expect(first).toHaveTextContent("₱99,999.50 of ₱100,000.00");
    expect(first).toHaveTextContent("by December 31, 2026");
    expect(first).toHaveTextContent("99%");
    expect(first).toHaveTextContent("₱0.50 to go");
    expect(
      within(first as HTMLElement).getByRole("progressbar", {
        name: "Emergency fund progress",
      })
    ).toHaveAttribute("aria-valuenow", "99");
    expect(
      within(first as HTMLElement).queryByText("Target reached")
    ).not.toBeInTheDocument();

    expect(second).toHaveTextContent("Laptop");
    expect(
      within(second as HTMLElement).getByText("Target reached")
    ).toBeVisible();
    expect(
      within(second as HTMLElement).getByRole("progressbar", {
        name: "Laptop progress",
      })
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("keeps completed goals and reveals archived ones as history", async () => {
    const user = userEvent.setup();
    renderPage();

    const completed = await screen.findByRole("list", {
      name: "Completed goals",
    });
    expect(completed).toHaveTextContent("Phone");
    expect(completed).toHaveTextContent("Completed June 30, 2026");
    expect(within(completed).getByText("Completed")).toBeVisible();

    expect(
      screen.queryByRole("list", { name: "Archived goals" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 archived" }));
    const archived = screen.getByRole("list", { name: "Archived goals" });
    expect(archived).toHaveTextContent("Boat");
    expect(archived).toHaveTextContent("Archived May 1, 2026");
    expect(archived).toHaveTextContent("(archived account)");
    expect(
      within(archived).getByRole("progressbar", { name: "Boat progress" })
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("creates a goal in an asset account", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Add a goal" }));
    await user.type(await screen.findByLabelText("Target amount"), "250000");
    await user.type(screen.getByLabelText("Name"), "House down payment");
    await user.click(screen.getByRole("combobox", { name: "Saved in" }));
    expect(
      screen.queryByRole("option", { name: /Visa/u })
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /BPI/u }));
    await user.click(screen.getByRole("button", { name: "Add goal" }));

    await waitFor(() =>
      expect(rpc.create).toHaveBeenCalledWith({
        accountId: SAVINGS,
        name: "House down payment",
        targetAmount: "250000",
        targetDate: null,
      })
    );
  });

  it("rejects a goal without a name or amount before calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New goal" }));
    await user.click(await screen.findByRole("button", { name: "Add goal" }));

    expect(await screen.findByText("Give the goal a name")).toBeVisible();
    expect(screen.getByText("Use a positive amount")).toBeVisible();
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("edits a goal, keeping its target date", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Emergency fund actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const amount = await screen.findByLabelText("Target amount");
    expect(amount).toHaveValue("100000");
    await user.clear(amount);
    await user.type(amount, "120000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(rpc.update).toHaveBeenCalledWith({
        accountId: SAVINGS,
        goalId: EMERGENCY,
        name: "Emergency fund",
        targetAmount: "120000",
        targetDate: "2026-12-31",
      })
    );
  });

  it("completes, reopens, archives and restores through the menu", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Laptop actions" })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark complete" })
    );
    await waitFor(() =>
      expect(rpc.complete).toHaveBeenCalledWith({ goalId: LAPTOP })
    );

    await user.click(screen.getByRole("button", { name: "Phone actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Edit" })
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Reopen" }));
    await waitFor(() =>
      expect(rpc.reopen).toHaveBeenCalledWith({ goalId: PHONE })
    );

    await user.click(
      screen.getByRole("button", { name: "Emergency fund actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    await waitFor(() =>
      expect(rpc.archive).toHaveBeenCalledWith({ goalId: EMERGENCY })
    );

    await user.click(screen.getByRole("button", { name: "Show 1 archived" }));
    await user.click(screen.getByRole("button", { name: "Boat actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Restore" }));
    await waitFor(() =>
      expect(rpc.restore).toHaveBeenCalledWith({ goalId: BOAT })
    );
  });

  it("points at adding an account when there is nothing to save in", async () => {
    rpc.list.mockResolvedValue([]);
    rpc.accounts.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No savings goals")).toBeVisible();
    expect(
      await screen.findByRole("link", { name: "Add an account first" })
    ).toHaveAttribute("href", "/accounts");
    expect(
      screen.queryByRole("button", { name: "New goal" })
    ).not.toBeInTheDocument();
  });

  it("shows an error state it can retry from", async () => {
    const user = userEvent.setup();
    rpc.list.mockRejectedValueOnce(new Error("offline"));
    renderPage();

    expect(await screen.findByText("Couldn’t load goals")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("list", { name: "Active goals" })
    ).toBeVisible();
  });

  it("gives a viewer the history without the controls", async () => {
    renderPage({
      canArchive: false,
      canCreate: false,
      canRestore: false,
      canUpdate: false,
    });

    expect(
      await screen.findByRole("list", { name: "Active goals" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New goal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Emergency fund actions" })
    ).not.toBeInTheDocument();
  });

  it("lets a member complete but not archive", async () => {
    const user = userEvent.setup();
    renderPage({ ...EVERYTHING, canArchive: false, canRestore: false });

    await user.click(
      await screen.findByRole("button", { name: "Emergency fund actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Mark complete" })
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Archive" })
    ).not.toBeInTheDocument();
  });
});
