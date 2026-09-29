import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: toastAdd, close: vi.fn(), update: vi.fn() },
}));

const list = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
const summary = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({
      categories: { archive, create, list, restore, update },
      transactions: { summary },
    }),
  };
});

const { CategoryManager } = await import("./category-manager");

const categories = [
  {
    archivedAt: null,
    color: "orange",
    icon: "🍽️",
    id: "food",
    name: "Food & Dining",
    organizationId: "h",
    sortOrder: 10,
    type: "expense",
  },
  {
    archivedAt: null,
    color: "emerald",
    icon: "💼",
    id: "salary",
    name: "Salary",
    organizationId: "h",
    sortOrder: 20,
    type: "income",
  },
  {
    archivedAt: new Date("2026-01-01"),
    color: "blue",
    icon: "🗂️",
    id: "old",
    name: "Old Category",
    organizationId: "h",
    sortOrder: 30,
    type: "expense",
  },
];

const renderManager = (currency?: string) =>
  renderWithProviders(
    <CategoryManager
      activeOrganizationId="household-1"
      canArchive
      canCreate
      canRestore
      canUpdate
      currency={currency}
      today="2026-09-24"
    />
  );

beforeEach(() => {
  for (const mock of [
    list,
    create,
    update,
    archive,
    restore,
    summary,
    toastAdd,
  ]) {
    mock.mockReset();
  }
  list.mockResolvedValue(categories);
  summary.mockResolvedValue({
    cashFlow: [],
    categories: [
      {
        categoryId: "food",
        color: "orange",
        count: 3,
        currencyCode: "PHP",
        icon: "🍽️",
        name: "Food & Dining",
        total: "1250.000000",
        type: "expense",
      },
    ],
  });
  create.mockResolvedValue({ id: "new" });
  archive.mockResolvedValue({});
  restore.mockResolvedValue({});
});

describe("CategoryManager", () => {
  it("lists one type at a time and keeps archived ones behind a toggle", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(await screen.findByText("Food & Dining")).toBeInTheDocument();
    expect(screen.queryByText("Salary")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Category")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 1 archived" }));
    expect(screen.getByText("Old Category")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Income/u }));
    expect(await screen.findByText("Salary")).toBeInTheDocument();
  });

  it("shows this month's spending beside each category", async () => {
    renderManager("PHP");
    expect(
      await screen.findByText(/this month · 3 entries/u)
    ).toBeInTheDocument();
  });

  it("creates a category of the type being viewed", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("Food & Dining");
    await user.click(screen.getByRole("tab", { name: /Income/u }));
    await user.click(screen.getByRole("button", { name: "New category" }));
    await user.type(await screen.findByLabelText("Name"), "Freelance");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Freelance", type: "income" })
    );
  });

  it("archives from the row menu and offers undo", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(
      await screen.findByRole("button", { name: "Food & Dining actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));

    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({ categoryId: "food" })
    );
    const toast = toastAdd.mock.calls.at(-1)?.[0];
    expect(toast.title).toBe("Category archived");
    toast.actionProps.onClick();
    await waitFor(() =>
      expect(restore).toHaveBeenCalledWith({ categoryId: "food" })
    );
  });
});
