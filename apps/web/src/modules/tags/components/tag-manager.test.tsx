import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithProviders } from "@/test/render";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

const list = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const archive = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());

vi.mock("@/utils/client", async () => {
  const { mockClient } = await import("@/test/client");
  return {
    client: mockClient({ tags: { archive, create, list, restore, update } }),
  };
});

const { TagManager } = await import("./tag-manager");

const renderManager = (canUpdate = true) =>
  renderWithProviders(
    <TagManager
      activeOrganizationId="household-1"
      canArchive
      canCreate
      canRestore
      canUpdate={canUpdate}
    />
  );

beforeEach(() => {
  for (const mock of [list, create, update, archive, restore]) {
    mock.mockReset();
  }
  list.mockResolvedValue([
    { archivedAt: null, color: "blue", id: "vacation", name: "Vacation" },
    {
      archivedAt: new Date("2026-01-01"),
      color: "red",
      id: "old",
      name: "Old Tag",
    },
  ]);
  create.mockResolvedValue({ id: "new" });
  update.mockResolvedValue({ id: "vacation" });
  restore.mockResolvedValue({});
});

describe("TagManager", () => {
  it("shows active tags and restores an archived one", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(await screen.findByText("Vacation")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 archived" }));
    await user.click(screen.getByRole("button", { name: "Old Tag actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Restore" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ tagId: "old" }));
  });

  it("creates a tag with a colour", async () => {
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("Vacation");
    await user.click(screen.getByRole("button", { name: "New tag" }));
    await user.type(await screen.findByLabelText("Name"), "Wedding");
    await user.click(screen.getByRole("radio", { name: "Rose" }));
    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ color: "rose", name: "Wedding" })
    );
  });

  it("edits a tag by clicking its row", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(await screen.findByText("Vacation"));
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Vacation");
    await user.clear(name);
    await user.type(name, "Holidays");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        color: "blue",
        name: "Holidays",
        tagId: "vacation",
      })
    );
  });
});
