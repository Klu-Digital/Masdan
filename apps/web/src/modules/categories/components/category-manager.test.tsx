import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const list = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());

vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    client: {
      categories: { archive, create, list, restore, update },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { CategoryManager } =
  await import("@/modules/categories/components/category-manager");

const categories = [
  {
    archivedAt: null,
    color: "orange",
    icon: "🍽️",
    id: "food",
    name: "Food & Dining",
    organizationId: "household-1",
    sortOrder: 10,
    type: "expense",
  },
  {
    archivedAt: new Date("2026-01-01"),
    color: "blue",
    icon: "🗂️",
    id: "old",
    name: "Old Category",
    organizationId: "household-1",
    sortOrder: 20,
    type: "expense",
  },
];

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderManager = () =>
  render(
    <CategoryManager
      activeOrganizationId="household-1"
      canArchive
      canCreate
      canRestore
      canUpdate
    />,
    { wrapper: Wrapper }
  );

beforeEach(() => {
  list.mockReset();
  create.mockReset();
  update.mockReset();
  archive.mockReset();
  restore.mockReset();
  list.mockResolvedValue(categories);
});

describe("CategoryManager", () => {
  it("shows active categories and can reveal archived categories", async () => {
    const user = userEvent.setup();
    renderManager();

    expect(await screen.findByText("Food & Dining")).toBeTruthy();
    expect(screen.queryByText("Old Category")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show archived" }));

    expect(screen.getByText("Old Category")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("opens the category form", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", { name: "Add category" })
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Category name")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByText("Income"));
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("group", { name: "Category colors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose emoji" })).toBeTruthy();
  });
});
