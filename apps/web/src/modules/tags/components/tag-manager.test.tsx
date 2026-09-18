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
    client: { tags: { archive, create, list, restore, update } },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { TagManager } = await import("@/modules/tags/components/tag-manager");

const tags = [
  {
    archivedAt: null,
    color: "orange",
    id: "vacation",
    name: "Vacation",
    organizationId: "household-1",
  },
  {
    archivedAt: new Date("2026-01-01"),
    color: "blue",
    id: "old",
    name: "Old Tag",
    organizationId: "household-1",
  },
];

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderManager = () =>
  render(
    <TagManager
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
  list.mockResolvedValue(tags);
});

describe("TagManager", () => {
  it("shows active tags and can reveal archived tags", async () => {
    const user = userEvent.setup();
    renderManager();

    expect(await screen.findByText("Vacation")).toBeTruthy();
    expect(screen.queryByText("Old Tag")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show archived" }));

    expect(screen.getByText("Old Tag")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("creates a tag from the form", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue({
      archivedAt: null,
      color: "blue",
      id: "new",
      name: "Reimbursable",
      organizationId: "household-1",
    });
    renderManager();

    await user.click(await screen.findByRole("button", { name: "Add tag" }));
    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      "Reimbursable"
    );
    await user.click(screen.getByRole("button", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Create tag" }));

    expect(create).toHaveBeenCalledWith({
      color: "blue",
      name: "Reimbursable",
    });
  });

  it("opens the tag form with color selection and preview", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("button", { name: "Add tag" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Tag name")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Tag colors" })).toBeTruthy();
  });
});
