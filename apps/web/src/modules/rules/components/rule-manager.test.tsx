import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";
import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const rpc = vi.hoisted(() => ({
  accounts: vi.fn(),
  categories: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  reorder: vi.fn(),
  setEnabled: vi.fn(),
  tags: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      accounts: { list: rpc.accounts },
      categories: { list: rpc.categories },
      rules: {
        create: rpc.create,
        delete: rpc.delete,
        list: rpc.list,
        reorder: rpc.reorder,
        setEnabled: rpc.setEnabled,
        update: rpc.update,
      },
      tags: { list: rpc.tags },
    },
  };
});

const { RuleManager } = await import("./rule-manager");

const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const TRANSPORT = "00000000-0000-4000-8000-000000000002";
const COMMUTE = "00000000-0000-4000-8000-000000000003";
const GRAB = "00000000-0000-4000-8000-000000000004";
const SMALL = "00000000-0000-4000-8000-000000000005";

const NO_CONDITIONS = {
  accountId: null,
  amountMax: null,
  amountMin: null,
  text: null,
  type: null,
};

const transport = {
  archivedAt: null,
  color: "sky",
  icon: "🚕",
  id: TRANSPORT,
  name: "Transport",
  type: "expense",
};
const commute = {
  archivedAt: null,
  color: "sky",
  id: COMMUTE,
  name: "Commute",
};

const grabRule = {
  actions: { categoryId: TRANSPORT, tagIds: [COMMUTE] },
  category: transport,
  conditions: {
    ...NO_CONDITIONS,
    text: { operator: "contains", value: "grab" },
    type: "expense",
  },
  createdAt: new Date("2026-09-01"),
  enabled: true,
  id: GRAB,
  name: "Grab rides",
  position: 0,
  problem: null,
  tags: [commute],
  updatedAt: new Date("2026-09-01"),
};

const smallRule = {
  actions: { categoryId: null, tagIds: [COMMUTE] },
  category: null,
  conditions: { ...NO_CONDITIONS, amountMax: "50" },
  createdAt: new Date("2026-09-02"),
  enabled: false,
  id: SMALL,
  name: "Small fares",
  position: 1,
  problem: null,
  tags: [commute],
  updatedAt: new Date("2026-09-02"),
};

const renderManager = (canDelete = true) =>
  renderWithProviders(
    <RuleManager
      activeOrganizationId="household-1"
      canCreate
      canDelete={canDelete}
      canUpdate
    />
  );

beforeEach(() => {
  for (const mock of Object.values(rpc)) {
    mock.mockReset();
  }
  rpc.list.mockResolvedValue([grabRule, smallRule]);
  rpc.accounts.mockResolvedValue([
    { archivedAt: null, currencyCode: "PHP", id: ACCOUNT, name: "BPI Savings" },
  ]);
  rpc.categories.mockResolvedValue([transport]);
  rpc.tags.mockResolvedValue([commute]);
  rpc.create.mockResolvedValue(grabRule);
  rpc.update.mockResolvedValue(grabRule);
  rpc.setEnabled.mockResolvedValue({ ...grabRule, enabled: false });
  rpc.reorder.mockResolvedValue([
    { ...smallRule, position: 0 },
    { ...grabRule, position: 1 },
  ]);
  rpc.delete.mockResolvedValue({ id: GRAB });
});

describe("RuleManager", () => {
  it("lists rules in the order they run, with what each matches and sets", async () => {
    renderManager();
    const list = await screen.findByRole("list", { name: "Rules" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Grab rides");
    expect(items[0]).toHaveTextContent(
      "When Description contains “grab” · Money out"
    );
    expect(items[0]).toHaveTextContent("Sets Transport · Adds Commute");
    expect(items[1]).toHaveTextContent("Small fares");
    expect(within(items[1] as HTMLElement).getByText("Off")).toBeVisible();
    expect(items[1]).toHaveTextContent("When Amount at most 50");
  });

  it("creates a rule that matches a description and sets a category and tag", async () => {
    const user = userEvent.setup();
    rpc.list.mockResolvedValue([]);
    renderManager();

    await user.click(await screen.findByRole("button", { name: "New rule" }));
    await user.type(await screen.findByLabelText("Name"), "Grab rides");
    await user.type(screen.getByLabelText("Description"), "grab");
    await user.click(screen.getByRole("combobox", { name: "Direction" }));
    await user.click(await screen.findByRole("option", { name: "Money out" }));
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: /Transport/u }));
    await user.click(screen.getByRole("button", { name: /Commute/u }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    await waitFor(() =>
      expect(rpc.create).toHaveBeenCalledWith({
        actions: { categoryId: TRANSPORT, tagIds: [COMMUTE] },
        conditions: {
          ...NO_CONDITIONS,
          text: { operator: "contains", value: "grab" },
          type: "expense",
        },
        enabled: true,
        name: "Grab rides",
      })
    );
  });

  it("asks for something to match and something to set", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: "New rule" }));
    await user.type(await screen.findByLabelText("Name"), "Empty");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(
      await screen.findByText("Add at least one thing to match")
    ).toBeVisible();
    expect(
      screen.getByText("Choose a category or tags for the rule to set")
    ).toBeVisible();
    expect(rpc.create).not.toHaveBeenCalled();
  });

  it("edits a rule, keeping what it doesn't change", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Grab rides actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Grab rides");
    await user.clear(name);
    await user.type(name, "Ride hailing");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(rpc.update).toHaveBeenCalledWith({
        actions: { categoryId: TRANSPORT, tagIds: [COMMUTE] },
        conditions: grabRule.conditions,
        enabled: true,
        name: "Ride hailing",
        ruleId: GRAB,
      })
    );
  });

  it("disables a rule with its switch", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("switch", { name: "Enable Grab rides" })
    );
    await waitFor(() =>
      expect(rpc.setEnabled).toHaveBeenCalledWith({
        enabled: false,
        ruleId: GRAB,
      })
    );
  });

  it("moves a rule to change precedence", async () => {
    const user = userEvent.setup();
    renderManager();

    const up = await screen.findByRole("button", {
      name: "Move Small fares up",
    });
    expect(
      screen.getByRole("button", { name: "Move Grab rides up" })
    ).toBeDisabled();
    await user.click(up);
    await waitFor(() =>
      expect(rpc.reorder).toHaveBeenCalledWith({ ruleIds: [SMALL, GRAB] })
    );
    const list = screen.getByRole("list", { name: "Rules" });
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
        "Small fares"
      )
    );
  });

  it("deletes a rule after confirming", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Grab rides actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("Delete “Grab rides”?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    await waitFor(() =>
      expect(rpc.delete).toHaveBeenCalledWith({ ruleId: GRAB })
    );
  });

  it("hides delete from a member who can't delete rules", async () => {
    const user = userEvent.setup();
    renderManager(false);

    await user.click(
      await screen.findByRole("button", { name: "Grab rides actions" })
    );
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("previews which rule matches a sample transaction and why", async () => {
    const user = userEvent.setup();
    renderManager();

    const tester = await screen.findByRole("region", {
      name: "Try your rules",
    });
    await user.type(
      within(tester).getByLabelText("Description"),
      "GRAB*RIDE Makati"
    );
    await user.type(within(tester).getByLabelText("Amount"), "30");

    expect(within(tester).getByText("Grab rides")).toBeVisible();
    const why = within(tester).getByRole("list", { name: "Why it matched" });
    expect(why).toHaveTextContent("Description contains “grab”");
    expect(why).toHaveTextContent("Money out");
    // The disabled "Small fares" rule would also match; it never runs.
    expect(within(tester).queryByText("Small fares")).not.toBeInTheDocument();
    expect(
      within(tester).getByText("Sets Transport · Adds Commute")
    ).toBeVisible();

    await user.clear(within(tester).getByLabelText("Description"));
    await user.type(within(tester).getByLabelText("Description"), "Jollibee");
    expect(within(tester).getByText(/No enabled rule matches/u)).toBeVisible();
  });
});
